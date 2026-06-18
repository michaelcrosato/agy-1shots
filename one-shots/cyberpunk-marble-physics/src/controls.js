import * as THREE from 'three';

/**
 * Handles keyboard input (WASD and arrow keys) with diagonal normalization.
 */
export class KeyboardControls {
  constructor() {
    this.keys = { W: false, A: false, S: false, D: false };

    this._onKeyDown = (/** @type {KeyboardEvent} */ e) => this.handleKey(e.code, true);
    this._onKeyUp = (/** @type {KeyboardEvent} */ e) => this.handleKey(e.code, false);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }
  }

  /**
   * @param {string} code
   * @param {boolean} isDown
   */
  handleKey(code, isDown) {
    if (code === 'KeyW' || code === 'ArrowUp') this.keys.W = isDown;
    if (code === 'KeyS' || code === 'ArrowDown') this.keys.S = isDown;
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.A = isDown;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.D = isDown;
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
    }
  }

  getRawInput() {
    let tx = 0;
    let tz = 0;

    if (this.keys.W) tz -= 1.0;
    if (this.keys.S) tz += 1.0;
    if (this.keys.A) tx -= 1.0;
    if (this.keys.D) tx += 1.0;

    // Normalize diagonal input to prevent speed boost
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len > 1.0) {
      tx /= len;
      tz /= len;
    }
    return { tx, tz };
  }
}

/**
 * Virtual joystick using mouse clicks/drags and touch gestures.
 */
export class MouseDragControls {
  /**
   * @param {HTMLCanvasElement|null} canvas
   * @param {number} [maxDragRadius]
   */
  constructor(canvas, maxDragRadius = 150) {
    this.canvas = canvas;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.MAX_DRAG_RADIUS = maxDragRadius || 150;

    this._onMouseDown = (/** @type {MouseEvent} */ e) => this.onStart(e.clientX, e.clientY);
    this._onMouseMove = (/** @type {MouseEvent} */ e) => this.onMove(e.clientX, e.clientY);
    this._onMouseUp = () => this.onEnd();

    this._onTouchStart = (/** @type {TouchEvent} */ e) => {
      if (e.touches && e.touches.length > 0) {
        this.onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    this._onTouchMove = (/** @type {TouchEvent} */ e) => {
      if (e.touches && e.touches.length > 0) {
        this.onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    this._onTouchEnd = () => this.onEnd();

    if (this.canvas && typeof window !== 'undefined') {
      this.canvas.addEventListener('mousedown', this._onMouseDown);
      this.canvas.addEventListener('mousemove', this._onMouseMove);
      this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
      this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: true });
      window.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('touchend', this._onTouchEnd);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  onStart(x, y) {
    this.isDragging = true;
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  onMove(x, y) {
    if (!this.isDragging) return;
    this.currentX = x;
    this.currentY = y;
  }

  onEnd() {
    this.isDragging = false;
  }

  destroy() {
    if (this.canvas && typeof window !== 'undefined') {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('touchstart', this._onTouchStart);
      this.canvas.removeEventListener('touchmove', this._onTouchMove);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('touchend', this._onTouchEnd);
    }
  }

  getRawInput() {
    if (!this.isDragging) return { tx: 0, tz: 0 };

    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;

    let tx = dx / this.MAX_DRAG_RADIUS;
    let tz = dy / this.MAX_DRAG_RADIUS;

    const len = Math.sqrt(tx * tx + tz * tz);
    if (len > 1.0) {
      tx /= len;
      tz /= len;
    }
    return { tx, tz };
  }
}

/**
 * Mobile accelerometer tilt controls with calibration and iOS permissions.
 */
export class AccelerometerControls {
  constructor() {
    this.beta = 45;
    this.gamma = 0;
    this.refBeta = 45;
    this.refGamma = 0;
    this.MAX_ANGLE = 15; // 15 degrees for maximum tilt
    this.active = false;

    this.handleOrientation = (/** @type {DeviceOrientationEvent} */ e) => {
      if (e.beta !== null && e.beta !== undefined) this.beta = e.beta;
      if (e.gamma !== null && e.gamma !== undefined) this.gamma = e.gamma;
    };
  }

  async requestPermission() {
    if (typeof window === 'undefined') return false;

    const DeviceOrientation = /** @type {any} */ (DeviceOrientationEvent);
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientation.requestPermission === 'function'
    ) {
      try {
        const state = await DeviceOrientation.requestPermission();
        if (state === 'granted') {
          window.addEventListener('deviceorientation', this.handleOrientation);
          this.active = true;
          return true;
        }
      } catch (err) {
        console.error('DeviceOrientation permission denied:', err);
      }
    } else if (typeof window !== 'undefined') {
      // Android / Non-iOS
      window.addEventListener('deviceorientation', this.handleOrientation);
      this.active = true;
      return true;
    }
    return false;
  }

  calibrate() {
    this.refBeta = this.beta;
    this.refGamma = this.gamma;
  }

  destroy() {
    if (this.active && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.handleOrientation);
      this.active = false;
    }
  }

  getRawInput() {
    if (!this.active) return { tx: 0, tz: 0 };

    const deltaBeta = this.beta - this.refBeta;
    const deltaGamma = this.gamma - this.refGamma;

    const angle = Math.sqrt(deltaGamma * deltaGamma + deltaBeta * deltaBeta);
    let tx = 0;
    let tz = 0;
    if (angle > 0) {
      const clampedAngle = Math.min(angle, 15.0);
      tx = (deltaGamma / angle) * (clampedAngle / 15.0);
      tz = (deltaBeta / angle) * (clampedAngle / 15.0);
    }

    return { tx, tz };
  }
}

/**
 * Manages active control scheme selection, blending, smoothing,
 * and viewport-relative camera yaw correction.
 */
export class ControlManager {
  /**
   * @param {HTMLCanvasElement|null} [canvas]
   * @param {any} [config]
   */
  constructor(canvas = null, config = {}) {
    this.keyboard = new KeyboardControls();
    this.mouse = new MouseDragControls(canvas, config.maxDragRadius);
    this.accel = new AccelerometerControls();

    this.currentTiltX = 0;
    this.currentTiltZ = 0;
    this.LERP_FACTOR = config.lerpFactor !== undefined ? config.lerpFactor : 0.08;
  }

  /**
   * Updates inputs and smooths them using an exponential moving average.
   * Optionally corrects raw inputs relative to the camera yaw.
   *
   * @param {THREE.Camera|null} [camera] - Optional camera to compute yaw-relative correction.
   * @param {THREE.Vector3|null} [marbleWorldPos] - Optional marble world position for camera relative yaw.
   */
  update(camera = null, marbleWorldPos = null) {
    const k = this.keyboard.getRawInput();
    const m = this.mouse.getRawInput();
    const a = this.accel.getRawInput();

    // Select the active scheme based on user activity hierarchy:
    // Keyboard takes priority, followed by Mouse drag, and finally Accelerometer.
    let targetX = 0;
    let targetZ = 0;

    if (k.tx !== 0 || k.tz !== 0) {
      targetX = k.tx;
      targetZ = k.tz;
    } else if (m.tx !== 0 || m.tz !== 0) {
      targetX = m.tx;
      targetZ = m.tz;
    } else {
      targetX = a.tx;
      targetZ = a.tz;
    }

    // Apply viewport-relative camera yaw correction if parameters are provided
    if (camera && marbleWorldPos) {
      const camAngle = Math.atan2(
        camera.position.x - marbleWorldPos.x,
        camera.position.z - marbleWorldPos.z
      );

      const adjustedTx = targetX * Math.cos(camAngle) - targetZ * Math.sin(camAngle);
      const adjustedTz = targetX * Math.sin(camAngle) + targetZ * Math.cos(camAngle);

      targetX = adjustedTx;
      targetZ = adjustedTz;
    }

    // Smooth final tilt using exponential moving average (lerp)
    this.currentTiltX += (targetX - this.currentTiltX) * this.LERP_FACTOR;
    this.currentTiltZ += (targetZ - this.currentTiltZ) * this.LERP_FACTOR;
  }

  /**
   * Returns the final smoothed and (optionally) yaw-corrected normalized tilt vector.
   *
   * @returns {{ tx: number, tz: number }} The tilt components { tx, tz } in range [-1.0, 1.0].
   */
  getNormalizedTilt() {
    return {
      tx: this.currentTiltX,
      tz: this.currentTiltZ,
    };
  }

  destroy() {
    this.keyboard.destroy();
    this.mouse.destroy();
    this.accel.destroy();
  }
}
