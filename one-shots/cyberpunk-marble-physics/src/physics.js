import * as THREE from 'three';

// Holds the loaded Rapier module instance
/** @type {any} */
let RAPIER = null;

/**
 * Calculates gravity components in the board's local space based on tilt input,
 * matching the mathematical design in analysis.md.
 *
 * @param {Object} tilt - Normalized tilt input.
 * @param {number} tilt.tx - Roll component (tilt left/right, range [-1, 1]).
 * @param {number} tilt.tz - Pitch component (tilt forward/backward, range [-1, 1]).
 * @returns {{x: number, y: number, z: number}} Rotated gravity components {x, y, z}.
 */
export function getGravityFromTilt(tilt) {
  const MAX_TILT_RAD = (15 * Math.PI) / 180; // 15 degrees max

  const thetaZ = -tilt.tx * MAX_TILT_RAD; // roll
  const thetaX = tilt.tz * MAX_TILT_RAD; // pitch

  const g = 9.81;
  const cosX = Math.cos(thetaX);
  const sinX = Math.sin(thetaX);
  const cosZ = Math.cos(thetaZ);
  const sinZ = Math.sin(thetaZ);

  // Calculate rotated gravity components in board local space
  const gx = -g * cosX * sinZ;
  const gy = -g * cosX * cosZ;
  const gz = -g * sinX;

  return { x: gx, y: gy, z: gz };
}

/**
 * Manages the Rapier3D physics world and the deterministic fixed-timestep accumulator loop.
 */
export class PhysicsSystem {
  constructor() {
    this.world = null;
    this.marbleBody = null;

    this.PHYSICS_DT = 1 / 60; // 60Hz step
    this.accumulator = 0;
    this.lastTime = null;

    // States for rendering interpolation
    this.prevPos = new THREE.Vector3();
    this.currPos = new THREE.Vector3();
    this.prevRot = new THREE.Quaternion();
    this.currRot = new THREE.Quaternion();
  }

  /**
   * Asynchronously loads '@dimforge/rapier3d-compat' and initializes the physics world.
   */
  async init() {
    if (!RAPIER) {
      RAPIER = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
    }

    // Initial gravity (flat board, pointing straight down)
    const initialGravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(initialGravity);
    this.RAPIER = RAPIER; // Export instance reference for utility/testing
  }

  /**
   * Initializes the physical marble rigid body and collider.
   *
   * @param {number} x - Start X position.
   * @param {number} y - Start Y position.
   * @param {number} z - Start Z position.
   */
  initMarble(x, y, z) {
    if (!this.world || !RAPIER) {
      throw new Error('PhysicsSystem must be initialized with init() before creating a marble.');
    }

    // Create dynamic rigid body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.1);
    this.marbleBody = this.world.createRigidBody(rigidBodyDesc);

    // Create sphere collider (1m diameter -> radius 0.5)
    const colliderDesc = RAPIER.ColliderDesc.ball(0.5).setRestitution(0.5).setFriction(0.2);
    this.world.createCollider(colliderDesc, this.marbleBody);

    // Seed the initial interpolation states
    const pos = this.marbleBody.translation();
    const rot = this.marbleBody.rotation();

    this.prevPos.set(pos.x, pos.y, pos.z);
    this.currPos.set(pos.x, pos.y, pos.z);
    this.prevRot.set(rot.x, rot.y, rot.z, rot.w);
    this.currRot.set(rot.x, rot.y, rot.z, rot.w);
  }

  /**
   * Creates a static collision box (e.g. for tracks or obstacles).
   *
   * @param {number} x - Center X position.
   * @param {number} y - Center Y position.
   * @param {number} z - Center Z position.
   * @param {number} hx - Half-width along X.
   * @param {number} hy - Half-height along Y.
   * @param {number} hz - Half-depth along Z.
   * @param {Object|null} [rotation] - Optional quaternion {x, y, z, w} for the box.
   * @returns {any} The created rigid body.
   */
  createStaticBox(x, y, z, hx, hy, hz, rotation = null) {
    if (!this.world || !RAPIER) {
      throw new Error('PhysicsSystem must be initialized with init() first.');
    }

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);

    if (rotation) {
      rigidBodyDesc.setRotation(rotation);
    }

    const body = this.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(0.5)
      .setFriction(0.2);

    this.world.createCollider(colliderDesc, body);
    return body;
  }

  /**
   * Advances the physics simulation using a deterministic fixed-timestep accumulator.
   *
   * @param {number} currentTimeMs - The current time in milliseconds.
   * @param {Function} [onStep] - Callback invoked before each step (typically to update gravity/forces).
   * @returns {{ alpha: number, prevPos: THREE.Vector3, currPos: THREE.Vector3, prevRot: THREE.Quaternion, currRot: THREE.Quaternion }} Render state interpolation details:
   *   - alpha: Leftover interpolation ratio in [0, 1)
   *   - prevPos: Position vector before the step
   *   - currPos: Position vector after the step
   *   - prevRot: Rotation quaternion before the step
   *   - currRot: Rotation quaternion after the step
   */
  update(currentTimeMs, onStep = undefined) {
    if (this.lastTime === null) {
      this.lastTime = currentTimeMs;
      return {
        alpha: 0,
        prevPos: this.prevPos,
        currPos: this.currPos,
        prevRot: this.prevRot,
        currRot: this.currRot,
      };
    }

    let dt = (currentTimeMs - this.lastTime) / 1000.0;
    this.lastTime = currentTimeMs;

    // Clamp dt to a minimum of 0.0 to prevent negative time deltas
    if (dt < 0.0) {
      dt = 0.0;
    }
    // Cap dt to prevent the "spiral of death" if the frame rate drops significantly
    if (dt > 0.25) {
      dt = 0.25;
    }

    this.accumulator += dt;

    while (this.accumulator >= this.PHYSICS_DT) {
      // 1. Record current state as "previous state" before stepping
      if (this.marbleBody) {
        const pos = this.marbleBody.translation();
        const rot = this.marbleBody.rotation();
        this.prevPos.set(pos.x, pos.y, pos.z);
        this.prevRot.set(rot.x, rot.y, rot.z, rot.w);
      }

      // 2. Invoke callback for external force / gravity updates
      if (onStep) {
        onStep();
      }

      // 3. Step physics simulation
      this.world.step();

      // 4. Record new state as "current state"
      if (this.marbleBody) {
        const nextPos = this.marbleBody.translation();
        const nextRot = this.marbleBody.rotation();
        this.currPos.set(nextPos.x, nextPos.y, nextPos.z);
        this.currRot.set(nextRot.x, nextRot.y, nextRot.z, nextRot.w);
      }

      this.accumulator -= this.PHYSICS_DT;
    }

    const alpha = this.accumulator / this.PHYSICS_DT;
    return {
      alpha,
      prevPos: this.prevPos,
      currPos: this.currPos,
      prevRot: this.prevRot,
      currRot: this.currRot,
    };
  }

  /**
   * Helper method to compute and return the linearly interpolated position
   * and spherically linearly interpolated (slerped) rotation.
   *
   * @param {number} alpha - Interpolation ratio in [0, 1).
   * @returns {{ pos: THREE.Vector3, rot: THREE.Quaternion }} The interpolated { pos, rot } as Three.js Vector3 and Quaternion.
   */
  getInterpolatedState(alpha) {
    const pos = new THREE.Vector3().lerpVectors(this.prevPos, this.currPos, alpha);
    const rot = this.prevRot.clone().slerp(this.currRot, alpha);
    return { pos, rot };
  }

  /**
   * Initializes the track colliders as a single static rigid body with multiple compound colliders.
   *
   * @param {Array<THREE.Vector3>} positions - Segment positions.
   * @param {Array<THREE.Quaternion>} quaternions - Segment rotations.
   * @param {number} width - Track width.
   * @param {number} height - Track height.
   * @param {number} length - Track length.
   */
  initTrackPhysics(positions, quaternions, width, height, length) {
    if (!this.world || !RAPIER) {
      throw new Error('PhysicsSystem must be initialized with init() first.');
    }

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const trackBody = this.world.createRigidBody(rigidBodyDesc);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfLength = length / 2;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const rot = quaternions[i];

      // Attach collider directly to the static track body
      const colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength)
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setRestitution(0.5)
        .setFriction(0.2);

      this.world.createCollider(colliderDesc, trackBody);
    }

    return trackBody;
  }
}
