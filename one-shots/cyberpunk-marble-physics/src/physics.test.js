import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsSystem, getGravityFromTilt } from './physics.js';

describe('Physics Module', () => {
  describe('getGravityFromTilt', () => {
    it('should return correct gravity for zero tilt', () => {
      const tilt = { tx: 0, tz: 0 };
      const gravity = getGravityFromTilt(tilt);
      expect(gravity.x).toBeCloseTo(0);
      expect(gravity.y).toBeCloseTo(-9.81);
      expect(gravity.z).toBeCloseTo(0);
    });

    it('should return correct gravity components for full pitch-down (W/up input)', () => {
      // tz = -1, tx = 0
      const tilt = { tx: 0, tz: -1 };
      const gravity = getGravityFromTilt(tilt);

      const MAX_TILT_RAD = (15 * Math.PI) / 180;
      const expectedGx = 0;
      const expectedGy = -9.81 * Math.cos(-MAX_TILT_RAD) * Math.cos(0);
      const expectedGz = -9.81 * Math.sin(-MAX_TILT_RAD);

      expect(gravity.x).toBeCloseTo(expectedGx);
      expect(gravity.y).toBeCloseTo(expectedGy);
      expect(gravity.z).toBeCloseTo(expectedGz);
    });

    it('should return correct gravity components for full roll-right (D/right input)', () => {
      // tx = 1, tz = 0
      const tilt = { tx: 1, tz: 0 };
      const gravity = getGravityFromTilt(tilt);

      const MAX_TILT_RAD = (15 * Math.PI) / 180;
      const expectedGx = -9.81 * Math.cos(0) * Math.sin(-MAX_TILT_RAD);
      const expectedGy = -9.81 * Math.cos(0) * Math.cos(-MAX_TILT_RAD);
      const expectedGz = 0;

      expect(gravity.x).toBeCloseTo(expectedGx);
      expect(gravity.y).toBeCloseTo(expectedGy);
      expect(gravity.z).toBeCloseTo(expectedGz);
    });
  });

  describe('PhysicsSystem', () => {
    /** @type {PhysicsSystem} */
    let physicsSystem;

    beforeEach(() => {
      physicsSystem = new PhysicsSystem();
    });

    it('should initialize successfully', async () => {
      await physicsSystem.init();
      expect(physicsSystem.world).toBeDefined();
      expect(physicsSystem.RAPIER).toBeDefined();
    });

    it('should initialize a marble dynamic rigid body', async () => {
      await physicsSystem.init();
      physicsSystem.initMarble(1, 2, 3);

      expect(physicsSystem.marbleBody).toBeDefined();

      const translation = physicsSystem.marbleBody.translation();
      expect(translation.x).toBe(1);
      expect(translation.y).toBe(2);
      expect(translation.z).toBe(3);

      expect(physicsSystem.prevPos.x).toBe(1);
      expect(physicsSystem.prevPos.y).toBe(2);
      expect(physicsSystem.prevPos.z).toBe(3);

      expect(physicsSystem.currPos.x).toBe(1);
      expect(physicsSystem.currPos.y).toBe(2);
      expect(physicsSystem.currPos.z).toBe(3);
    });

    it('should create static boxes', async () => {
      await physicsSystem.init();
      const body = physicsSystem.createStaticBox(0, -1, 0, 10, 0.5, 10);
      expect(body).toBeDefined();
      expect(body.isFixed()).toBe(true);

      const translation = body.translation();
      expect(translation.x).toBe(0);
      expect(translation.y).toBe(-1);
      expect(translation.z).toBe(0);
    });

    it('should step the simulation deterministic loop', async () => {
      await physicsSystem.init();
      physicsSystem.initMarble(0, 10, 0);

      // Trigger update with dt = 0 initially (returns initial state)
      const res1 = physicsSystem.update(0);
      expect(res1.alpha).toBe(0);

      // Step by 20ms (more than 16.67ms PHYSICS_DT)
      // This should step exactly once
      const onStepMock = vi.fn();
      const res2 = physicsSystem.update(20, onStepMock);

      expect(onStepMock).toHaveBeenCalledTimes(1);
      expect(res2.alpha).toBeCloseTo((20 - 16.66667) / 16.66667, 1);
    });

    it('should interpolate rendering states', async () => {
      await physicsSystem.init();
      physicsSystem.initMarble(0, 0, 0);

      physicsSystem.prevPos.set(0, 0, 0);
      physicsSystem.currPos.set(2, 4, 6);

      physicsSystem.prevRot.set(0, 0, 0, 1);
      // Construct a valid target quaternion (90 deg around Y)
      physicsSystem.currRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

      const { pos, rot } = physicsSystem.getInterpolatedState(0.5);

      expect(pos.x).toBe(1);
      expect(pos.y).toBe(2);
      expect(pos.z).toBe(3);

      // Slerp halfway should be 45 degrees around Y
      const expectedRot = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 4
      );
      expect(rot.x).toBeCloseTo(expectedRot.x);
      expect(rot.y).toBeCloseTo(expectedRot.y);
      expect(rot.z).toBeCloseTo(expectedRot.z);
      expect(rot.w).toBeCloseTo(expectedRot.w);
    });

    it('should initialize compound track physics', async () => {
      await physicsSystem.init();
      const positions = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)];
      const quaternions = [new THREE.Quaternion(0, 0, 0, 1), new THREE.Quaternion(0, 0, 0, 1)];

      const trackBody = physicsSystem.initTrackPhysics(positions, quaternions, 6, 1, 4);
      expect(trackBody).toBeDefined();
      expect(trackBody.isFixed()).toBe(true);
    });
  });
});
