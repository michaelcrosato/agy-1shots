import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Noise, getPathPos, getPathBank, generateTrackTransforms } from './generator.js';

describe('Track Generator Module', () => {
  describe('Noise', () => {
    it('should return a value between -1 and 1', () => {
      for (let s = 0; s < 100; s += 5) {
        const val = Noise(s);
        expect(val).toBeGreaterThanOrEqual(-1.0);
        expect(val).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('getPathPos', () => {
    it('should return a THREE.Vector3 with correct x component matching s', () => {
      const s = 10.5;
      const pos = getPathPos(s);
      expect(pos).toBeInstanceOf(THREE.Vector3);
      expect(pos.x).toBe(s);
    });
  });

  describe('getPathBank', () => {
    it('should return a number representing the bank angle', () => {
      const bank = getPathBank(12.3);
      expect(typeof bank).toBe('number');
    });
  });

  describe('generateTrackTransforms', () => {
    it('should return arrays of the requested size', () => {
      const count = 50;
      const { matrices, positions, quaternions } = generateTrackTransforms(count, 6, 1, 4);
      expect(matrices).toHaveLength(count);
      expect(positions).toHaveLength(count);
      expect(quaternions).toHaveLength(count);

      expect(matrices[0]).toBeInstanceOf(THREE.Matrix4);
      expect(positions[0]).toBeInstanceOf(THREE.Vector3);
      expect(quaternions[0]).toBeInstanceOf(THREE.Quaternion);
    });
  });
});
