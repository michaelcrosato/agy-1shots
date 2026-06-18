import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsSystem, getGravityFromTilt } from './physics.js';

describe('Physics System Stress Tests', () => {
  /** @type {PhysicsSystem} */
  let physicsSystem;

  beforeEach(async () => {
    physicsSystem = new PhysicsSystem();
    await physicsSystem.init();
    physicsSystem.initMarble(0, 10, 0);
  });

  it('should keep alpha bounded in [0, 1) under normal conditions', () => {
    let currentTime = 0;
    physicsSystem.update(currentTime); // initial call to set lastTime

    // Simulate 1000 frames with random realistic frame times (12ms to 24ms)
    for (let i = 0; i < 1000; i++) {
      const dt = 12 + Math.random() * 12; // 12-24 ms
      currentTime += dt;
      const res = physicsSystem.update(currentTime);
      expect(res.alpha).toBeGreaterThanOrEqual(0);
      expect(res.alpha).toBeLessThan(1.0);
    }
  });

  it('should handle large frame spikes (tab defocus simulation) and cap dt', () => {
    let currentTime = 0;
    physicsSystem.update(currentTime);

    // Simulate a 10-second pause
    currentTime += 10000;

    // Track calls to world.step
    const originalStep = physicsSystem.world.step.bind(physicsSystem.world);
    let stepCount = 0;
    physicsSystem.world.step = () => {
      stepCount++;
      originalStep();
    };

    const res = physicsSystem.update(currentTime);

    // With dt capped at 0.25s:
    // PHYSICS_DT = 1/60 = 0.01666667
    // Max steps = floor(0.25 / (1/60)) = 15 steps
    expect(stepCount).toBe(15);
    expect(res.alpha).toBeGreaterThanOrEqual(0);
    expect(res.alpha).toBeLessThan(1.0);

    // Remaining accumulator should be 0.25 - (15 * (1/60))
    // 0.25 - 0.25 = 0
    expect(physicsSystem.accumulator).toBeCloseTo(0);
    expect(res.alpha).toBeCloseTo(0);
  });

  it('should handle extremely high frame rates (e.g. 1000 FPS)', () => {
    let currentTime = 0;
    physicsSystem.update(currentTime);

    // Simulate 60 frames, each taking exactly 1ms (total 60ms)
    // PHYSICS_DT is 16.66667ms, so we expect exactly 3 steps to occur overall
    const originalStep = physicsSystem.world.step.bind(physicsSystem.world);
    let stepCount = 0;
    physicsSystem.world.step = () => {
      stepCount++;
      originalStep();
    };

    for (let i = 0; i < 60; i++) {
      currentTime += 1; // 1ms
      const res = physicsSystem.update(currentTime);
      expect(res.alpha).toBeGreaterThanOrEqual(0);
      expect(res.alpha).toBeLessThan(1.0);
    }

    expect(stepCount).toBe(3); // 60ms / 16.66667ms = 3.6 -> floor is 3 steps
    expect(physicsSystem.accumulator).toBeCloseTo((60 - 3 * (1000 / 60)) / 1000, 5);
  });

  it('should verify determinism: same cumulative steps yield identical physics states', async () => {
    // We will compare two identical physics systems
    const sysA = new PhysicsSystem();
    await sysA.init();
    sysA.initMarble(0, 10, 0);

    const sysB = new PhysicsSystem();
    await sysB.init();
    sysB.initMarble(0, 10, 0);

    // Run sysA with regular 16.66667ms steps (60 steps)
    let timeA = 0;
    sysA.update(timeA);
    for (let i = 0; i < 60; i++) {
      timeA += 16.66666667;
      sysA.update(timeA);
    }

    // Run sysB with erratic steps: e.g. 5ms, 45ms, 10ms, 100ms, but total time is exactly the same: 60 * 16.66666667 = 1000ms
    let timeB = 0;
    sysB.update(timeB);
    const deltas = [5, 45, 10, 100, 15, 25, 200, 30, 70, 100, 50, 50, 100, 100, 50, 50]; // sum = 1000ms
    for (const dt of deltas) {
      timeB += dt;
      sysB.update(timeB);
    }

    // Since both ran exactly the same total simulated time (1000ms) and never hit the 250ms cap,
    // they should have executed exactly 60 steps.
    const posA = sysA.marbleBody.translation();
    const posB = sysB.marbleBody.translation();
    const velA = sysA.marbleBody.linvel();
    const velB = sysB.marbleBody.linvel();

    expect(posA.x).toBeCloseTo(posB.x, 5);
    expect(posA.y).toBeCloseTo(posB.y, 5);
    expect(posA.z).toBeCloseTo(posB.z, 5);

    expect(velA.x).toBeCloseTo(velB.x, 5);
    expect(velA.y).toBeCloseTo(velB.y, 5);
    expect(velA.z).toBeCloseTo(velB.z, 5);
  });

  it('should investigate negative time delta behavior (regression/bug risk)', () => {
    let currentTime = 1000;
    physicsSystem.update(currentTime);

    // Simulate clock going backwards
    currentTime -= 100; // -100ms
    const res = physicsSystem.update(currentTime);

    // Check if alpha goes out of bounds when dt is negative
    // Accumulator would decrease by -0.1
    console.log(
      'Negative DT results: alpha =',
      res.alpha,
      'accumulator =',
      physicsSystem.accumulator
    );

    // We expect that a robust loop should handle this (either cap dt at 0, or log warning).
    // Now with dt clamped to 0.0, alpha is clamped to 0 and accumulator is not negative
    expect(res.alpha).toBe(0);
    expect(physicsSystem.accumulator).toBe(0);
  });

  it('should investigate zero time delta behavior', () => {
    let currentTime = 1000;
    physicsSystem.update(currentTime);

    const res = physicsSystem.update(currentTime); // dt = 0
    expect(res.alpha).toBe(0);
    expect(physicsSystem.accumulator).toBe(0);
  });

  it('should not accumulate significant numerical precision drift over 100,000 steps', () => {
    let currentTime = 0;
    physicsSystem.update(currentTime);

    // Simulate 100,000 frames of realistic dt
    let totalDts = 0;
    let expectedSteps = 0;

    for (let i = 0; i < 100000; i++) {
      // Use dt values between 15ms and 20ms
      const dtMs = 15.0 + (i % 6) * 1.0;
      currentTime += dtMs;
      totalDts += dtMs / 1000.0;

      // We manually keep track of the steps that should happen
      // step occurs when (accumulator + dt) >= PHYSICS_DT
      const prevAccumulator = physicsSystem.accumulator;
      const stepResult = physicsSystem.update(currentTime);

      const actualStepCount = Math.floor((prevAccumulator + dtMs / 1000.0) / (1 / 60));
      expectedSteps += actualStepCount;
    }

    // After 100,000 updates, verify that the relation:
    // totalDts = expectedSteps * PHYSICS_DT + currentAccumulator
    // holds true with extremely high precision.
    const physicsDt = 1 / 60;
    const computedTotal = expectedSteps * physicsDt + physicsSystem.accumulator;
    const absoluteDiff = Math.abs(computedTotal - totalDts);

    console.log('Precision Drift Test Results:');
    console.log('  Total Simulated dt:', totalDts, 'seconds');
    console.log('  Total Steps Run:', expectedSteps);
    console.log('  Remaining Accumulator:', physicsSystem.accumulator);
    console.log('  Absolute difference:', absoluteDiff, 'seconds');

    // Expected difference is virtually zero due to double precision floating-point arithmetic
    expect(absoluteDiff).toBeLessThan(1e-8);
  });
});
