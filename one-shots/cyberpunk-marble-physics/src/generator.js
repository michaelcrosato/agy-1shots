import * as THREE from 'three';

/**
 * A clean pseudo-random 1D noise based on multiple sine waves
 * to generate smooth hills and curves.
 *
 * @param {number} x - Input coordinate.
 * @returns {number} Noise value in range [-1, 1].
 */
export function Noise(x) {
  return Math.sin(x) * 0.5 + Math.sin(x * 2.1) * 0.3 + Math.cos(x * 0.45) * 0.2;
}

/**
 * Computes the 3D position of the track centerline at a given progress s.
 *
 * @param {number} s - Longitudinal progress along the track.
 * @returns {THREE.Vector3} Centerline position.
 */
export function getPathPos(s) {
  const x = s;
  const y = Noise(s * 0.015) * 18.0 + Noise(s * 0.08) * 3.5;
  const z = Noise(s * 0.01 + 50.0) * 24.0;
  return new THREE.Vector3(x, y, z);
}

/**
 * Computes the bank angle in radians of the track at a given progress s.
 *
 * @param {number} s - Longitudinal progress along the track.
 * @returns {number} Bank angle in radians.
 */
export function getPathBank(s) {
  return Noise(s * 0.025 + 100.0) * 0.35;
}

/**
 * Generates matrix transformations, positions, and quaternions for the track segments.
 *
 * @param {number} totalSegments - Total number of segments to generate.
 * @param {number} segmentWidth - Width of each segment.
 * @param {number} segmentHeight - Height (thickness) of each segment.
 * @param {number} segmentLength - Length of each segment along the path direction.
 * @returns {{ matrices: Array<THREE.Matrix4>, positions: Array<THREE.Vector3>, quaternions: Array<THREE.Quaternion> }} { matrices, positions, quaternions }
 */
export function generateTrackTransforms(totalSegments, segmentWidth, segmentHeight, segmentLength) {
  const matrices = [];
  const positions = [];
  const quaternions = [];

  for (let i = 0; i < totalSegments; i++) {
    const s = i * segmentLength;
    const pCurrent = getPathPos(s);
    const pNext = getPathPos(s + segmentLength);

    // 1. Tangent (direction vector along the track)
    const tangent = new THREE.Vector3().subVectors(pNext, pCurrent).normalize();

    // 2. Normal with Banking (local up vector)
    const bankAngle = getPathBank(s);
    const baseUp = new THREE.Vector3(0, 1, 0);
    // Apply quaternion rotation around the tangent axis
    const bankRot = new THREE.Quaternion().setFromAxisAngle(tangent, bankAngle);
    const normal = baseUp.clone().applyQuaternion(bankRot).normalize();

    // 3. Binormal (sideways vector)
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    // 4. Matrix construction
    const rotMatrix = new THREE.Matrix4().makeBasis(binormal, normal, tangent);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    const scale = new THREE.Vector3(segmentWidth, segmentHeight, segmentLength);

    const matrix = new THREE.Matrix4().compose(pCurrent, quat, scale);

    matrices.push(matrix);
    positions.push(pCurrent);
    quaternions.push(quat);
  }

  return { matrices, positions, quaternions };
}
