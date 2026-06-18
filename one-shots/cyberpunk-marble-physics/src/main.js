import * as THREE from 'three';
import { PhysicsSystem, getGravityFromTilt } from './physics.js';
import { ControlManager } from './controls.js';
import { GameRenderer } from './renderer.js';
import { generateTrackTransforms } from './generator.js';

// Configuration
const TOTAL_SEGMENTS = 200;
const SEGMENT_WIDTH = 6;
const SEGMENT_HEIGHT = 1;
const SEGMENT_LENGTH = 4;

async function initGame() {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    console.error('Canvas element not found or invalid!');
    return;
  }

  // 1. Initialize rendering pipeline
  const gameRenderer = new GameRenderer(canvas);
  const { scene, camera } = gameRenderer;

  // 2. Initialize physics system
  const physicsSystem = new PhysicsSystem();
  await physicsSystem.init();

  // 3. Generate procedural track transforms
  const { matrices, positions, quaternions } = generateTrackTransforms(
    TOTAL_SEGMENTS,
    SEGMENT_WIDTH,
    SEGMENT_HEIGHT,
    SEGMENT_LENGTH
  );

  // 4. Initialize compound physics track colliders
  physicsSystem.initTrackPhysics(
    positions,
    quaternions,
    SEGMENT_WIDTH,
    SEGMENT_HEIGHT,
    SEGMENT_LENGTH
  );

  // 5. Create visual InstancedMesh objects for the track
  // We use alternating segments to showcase both shader materials
  const boxGeom = new THREE.BoxGeometry(1, 1, 1);
  const evenCount = Math.ceil(TOTAL_SEGMENTS / 2);
  const oddCount = Math.floor(TOTAL_SEGMENTS / 2);

  const neonGridMesh = new THREE.InstancedMesh(boxGeom, gameRenderer.neonGridMaterial, evenCount);
  const pbrMesh = new THREE.InstancedMesh(boxGeom, gameRenderer.distancePbrMaterial, oddCount);

  neonGridMesh.castShadow = true;
  neonGridMesh.receiveShadow = true;
  pbrMesh.castShadow = true;
  pbrMesh.receiveShadow = true;

  let evenIdx = 0;
  let oddIdx = 0;

  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    if (i % 2 === 0) {
      neonGridMesh.setMatrixAt(evenIdx, matrices[i]);
      evenIdx++;
    } else {
      pbrMesh.setMatrixAt(oddIdx, matrices[i]);
      oddIdx++;
    }
  }

  neonGridMesh.instanceMatrix.needsUpdate = true;
  pbrMesh.instanceMatrix.needsUpdate = true;
  neonGridMesh.computeBoundingSphere();
  pbrMesh.computeBoundingSphere();

  scene.add(neonGridMesh);
  scene.add(pbrMesh);

  // 6. Setup player marble (start at segment 0, slightly elevated in local up direction)
  const baseUp = new THREE.Vector3(0, 1, 0);
  const startUpVec = baseUp.clone().applyQuaternion(quaternions[0]).normalize();
  const startPos = positions[0].clone().addScaledVector(startUpVec, 2.5);

  physicsSystem.initMarble(startPos.x, startPos.y, startPos.z);

  // Visual marble mesh (diameter 1.0 -> radius 0.5)
  const marbleGeom = new THREE.SphereGeometry(0.5, 32, 32);
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xff00ff,
    roughness: 0.1,
    metalness: 0.95,
    emissive: 0x330033,
  });
  const marbleMesh = new THREE.Mesh(marbleGeom, marbleMat);
  marbleMesh.castShadow = true;
  marbleMesh.receiveShadow = true;
  scene.add(marbleMesh);

  // 7. Initialize control manager
  const controlManager = new ControlManager(canvas);

  // HUD Elements
  const coordsEl = document.getElementById('coords');
  const velocityEl = document.getElementById('velocity');
  const tiltEl = document.getElementById('tilt');
  const btnAccel = document.getElementById('btn-accel');

  if (btnAccel) {
    btnAccel.addEventListener('click', async () => {
      const success = await controlManager.accel.requestPermission();
      if (success) {
        controlManager.accel.calibrate();
        btnAccel.textContent = 'MOBILE TILT ACTIVE';
        btnAccel.style.background = '#00ffff';
        btnAccel.style.color = '#000000';
        btnAccel.style.textShadow = '0 0 2px #00ffff';
        btnAccel.style.border = '1px solid #ff00ff';
      } else {
        btnAccel.textContent = 'PERMISSION DENIED';
        btnAccel.style.background = '#ff0000';
        btnAccel.style.color = '#ffffff';
        btnAccel.style.textShadow = 'none';
      }
    });
  }

  // Key listeners for manual reset / respawn
  const handleKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (e.code === 'Space' || e.code === 'KeyR') {
      respawnMarble();
    }
  };
  window.addEventListener('keydown', handleKeyDown);

  function respawnMarble() {
    if (physicsSystem.marbleBody) {
      physicsSystem.marbleBody.setTranslation(startPos, true);
      physicsSystem.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      physicsSystem.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // Reset accumulator interpolation states
      physicsSystem.prevPos.copy(startPos);
      physicsSystem.currPos.copy(startPos);
      physicsSystem.prevRot.set(0, 0, 0, 1);
      physicsSystem.currRot.set(0, 0, 0, 1);
    }
  }

  // Follow camera parameters
  const cameraOffset = new THREE.Vector3(0, 12, 22);
  const targetCameraPos = new THREE.Vector3();

  // Timing
  const startTimeMs = performance.now();
  let lastTimeMs = performance.now();

  // Decoupled physics-rendering loop
  function loop(/** @type {number} */ currentTimeMs) {
    requestAnimationFrame(loop);

    // Update controls (passes camera and interpolated position for yaw correction)
    const currentPos = physicsSystem.prevPos; // safe approximation for input correction
    controlManager.update(camera, currentPos);

    // Step physics using accumulator
    const updateResult = physicsSystem.update(currentTimeMs, () => {
      // Step callback: read controls, calculate and apply gravity
      const tilt = controlManager.getNormalizedTilt();
      const gravity = getGravityFromTilt(tilt);
      physicsSystem.world.gravity = gravity;
    });

    const { alpha } = updateResult;

    // Get interpolated rendering states
    const interpolated = physicsSystem.getInterpolatedState(alpha);

    // Sync visual mesh with physics
    marbleMesh.position.copy(interpolated.pos);
    marbleMesh.quaternion.copy(interpolated.rot);

    // Out-of-bounds respawn (falls off track into space)
    if (interpolated.pos.y < -35) {
      respawnMarble();
    }

    // Dynamic Follow Camera with Dampening (Lerp)
    targetCameraPos.copy(interpolated.pos).add(cameraOffset);
    camera.position.lerp(targetCameraPos, 0.08);
    camera.lookAt(interpolated.pos);

    // Update shader uniforms (coordinates, lighting, camera position, time)
    const elapsedSeconds = (currentTimeMs - startTimeMs) / 1000.0;
    gameRenderer.updateUniforms(interpolated.pos, elapsedSeconds);

    // Render pass
    gameRenderer.render();

    // Update HUD telemetry
    if (coordsEl && velocityEl && tiltEl && physicsSystem.marbleBody) {
      coordsEl.textContent = `X: ${interpolated.pos.x.toFixed(2)} Y: ${interpolated.pos.y.toFixed(2)} Z: ${interpolated.pos.z.toFixed(2)}`;

      const linvel = physicsSystem.marbleBody.linvel();
      const speed = Math.sqrt(linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z);
      velocityEl.textContent = `${speed.toFixed(2)} M/S`;

      const tilt = controlManager.getNormalizedTilt();
      tiltEl.textContent = `X: ${tilt.tx.toFixed(2)} Z: ${tilt.tz.toFixed(2)}`;
    }
  }

  // Start the game loop
  requestAnimationFrame(loop);
}

// Start game initialization
initGame().catch((err) => {
  console.error('Failed to initialize game:', err);
});
