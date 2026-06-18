import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  KeyboardControls,
  MouseDragControls,
  AccelerometerControls,
  ControlManager,
} from './controls.js';

describe('Controls Module', () => {
  describe('KeyboardControls', () => {
    /** @type {KeyboardControls} */
    let keyboard;

    beforeEach(() => {
      keyboard = new KeyboardControls();
    });

    it('should initialize keys state as all false', () => {
      expect(keyboard.keys.W).toBe(false);
      expect(keyboard.keys.S).toBe(false);
      expect(keyboard.keys.A).toBe(false);
      expect(keyboard.keys.D).toBe(false);
    });

    it('should handleKey keydown and keyup', () => {
      keyboard.handleKey('KeyW', true);
      expect(keyboard.keys.W).toBe(true);

      keyboard.handleKey('KeyW', false);
      expect(keyboard.keys.W).toBe(false);

      keyboard.handleKey('ArrowDown', true);
      expect(keyboard.keys.S).toBe(true);
    });

    it('should normalize diagonal keyboard inputs', () => {
      keyboard.handleKey('KeyW', true); // tz = -1
      keyboard.handleKey('KeyD', true); // tx = 1

      const raw = keyboard.getRawInput();
      const magnitude = Math.sqrt(raw.tx * raw.tx + raw.tz * raw.tz);
      expect(magnitude).toBeCloseTo(1.0);
      expect(raw.tx).toBeCloseTo(1 / Math.sqrt(2));
      expect(raw.tz).toBeCloseTo(-1 / Math.sqrt(2));
    });

    it('should cancel opposing keyboard inputs', () => {
      keyboard.handleKey('KeyW', true);
      keyboard.handleKey('KeyS', true);
      const raw = keyboard.getRawInput();
      expect(raw.tz).toBe(0);
    });
  });

  describe('MouseDragControls', () => {
    it('should calculate raw input correctly based on drag radius', () => {
      const mouse = new MouseDragControls(null, 100);
      expect(mouse.getRawInput()).toEqual({ tx: 0, tz: 0 });

      // Start drag
      mouse.onStart(100, 100);
      // Move 50px right, 50px down
      mouse.onMove(150, 150);

      let raw = mouse.getRawInput();
      expect(raw.tx).toBeCloseTo(0.5);
      expect(raw.tz).toBeCloseTo(0.5);

      // Move beyond radius (e.g. 200px right, 0px down)
      mouse.onMove(300, 100);
      raw = mouse.getRawInput();
      expect(raw.tx).toBe(1.0);
      expect(raw.tz).toBe(0.0);

      // End drag
      mouse.onEnd();
      expect(mouse.getRawInput()).toEqual({ tx: 0, tz: 0 });
    });
  });

  describe('AccelerometerControls', () => {
    /** @type {AccelerometerControls} */
    let accel;

    beforeEach(() => {
      accel = new AccelerometerControls();
    });

    it('should calibrate orientation reference angles', () => {
      accel.beta = 50;
      accel.gamma = 5;
      accel.calibrate();

      expect(accel.refBeta).toBe(50);
      expect(accel.refGamma).toBe(5);
    });

    it('should return raw input adjusted by calibration and clamped', () => {
      accel.active = true;
      accel.beta = 60; // 15 deg over refBeta (45)
      accel.gamma = -15; // -15 deg over refGamma (0)

      const raw = accel.getRawInput();
      // Combined angle: sqrt(15^2 + 15^2) = 21.21 deg, clamped to 15 deg.
      // tx = -15 / 21.213 = -0.7071, tz = 15 / 21.213 = 0.7071
      expect(raw.tx).toBeCloseTo(-1 / Math.sqrt(2));
      expect(raw.tz).toBeCloseTo(1 / Math.sqrt(2));

      // Tilt beyond 15 degrees in one axis only
      accel.gamma = 0; // reset to 0
      accel.beta = 90; // 45 deg over refBeta (45)
      expect(accel.getRawInput().tz).toBe(1.0);
      expect(accel.getRawInput().tx).toBe(0.0);
    });
  });

  describe('ControlManager Blending & Camera Correction', () => {
    /** @type {ControlManager} */
    let manager;

    beforeEach(() => {
      manager = new ControlManager(null, { lerpFactor: 0.1 });
    });

    it('should blend inputs prioritizing keyboard -> mouse -> accelerometer', () => {
      // 1. Accel is active
      manager.accel.active = true;
      manager.accel.beta = 60; // tz = 0.5
      manager.update();
      expect(manager.currentTiltZ).toBeGreaterThan(0);

      // Reset
      manager.currentTiltZ = 0;

      // 2. Mouse drag is active, should override accel
      manager.mouse.isDragging = true;
      manager.mouse.startX = 0;
      manager.mouse.startY = 0;
      manager.mouse.currentX = 0;
      manager.mouse.currentY = -50; // tz = -0.33 (since radius is 150)

      manager.update();
      expect(manager.currentTiltZ).toBeLessThan(0);

      // Reset
      manager.currentTiltZ = 0;

      // 3. Keyboard is active, should override mouse drag
      manager.keyboard.keys.S = true; // tz = 1
      manager.update();
      expect(manager.currentTiltZ).toBeGreaterThan(0);
    });

    it('should apply viewport-relative camera yaw correction', () => {
      // Keyboard input: pressing W (tz = -1)
      manager.keyboard.keys.W = true;

      // Camera is rotated 90 degrees around Y (looking from positive X towards origin)
      // Pos = (10, 0, 0), Target = (0, 0, 0)
      const camera = {
        position: new THREE.Vector3(10, 0, 0),
      };
      const marbleWorldPos = new THREE.Vector3(0, 0, 0);

      // camAngle = Math.atan2(10 - 0, 0 - 0) = Math.atan2(10, 0) = Math.PI / 2
      // targetX = 0, targetZ = -1
      // adjustedTx = 0 * cos(PI/2) - (-1) * sin(PI/2) = 1
      // adjustedTz = 0 * sin(PI/2) + (-1) * cos(PI/2) = 0
      manager.update(/** @type {any} */ (camera), marbleWorldPos);

      // Since we update once with LERP_FACTOR = 0.1:
      // currentTiltX = 0 + (1 - 0) * 0.1 = 0.1
      // currentTiltZ = 0 + (0 - 0) * 0.1 = 0
      expect(manager.currentTiltX).toBeCloseTo(0.1);
      expect(manager.currentTiltZ).toBeCloseTo(0);
    });
  });
});
