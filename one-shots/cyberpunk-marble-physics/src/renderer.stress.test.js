import { describe, it, expect } from 'vitest';

// Cook-Torrance PBR math translated from src/renderer.js fragmentShader
/**
 * @param {number} NdotH
 * @param {number} roughness
 * @returns {number}
 */
function D_GGX(NdotH, roughness) {
  const a = roughness * roughness;
  const a2 = a * a;
  const pi = Math.PI;
  const NdotH2 = NdotH * NdotH;
  const denom = NdotH2 * (a2 - 1.0) + 1.0;
  return a2 / (pi * denom * denom);
}

/**
 * @param {number} NdotV
 * @param {number} roughness
 * @returns {number}
 */
function G1_SchlickGGX(NdotV, roughness) {
  const r = roughness + 1.0;
  const k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

/**
 * @param {number} NdotV
 * @param {number} NdotL
 * @param {number} roughness
 * @returns {number}
 */
function G_Smith(NdotV, NdotL, roughness) {
  return G1_SchlickGGX(NdotV, roughness) * G1_SchlickGGX(NdotL, roughness);
}

/**
 * @param {number} cosTheta
 * @param {any} F0
 * @returns {any}
 */
function F_Schlick(cosTheta, F0) {
  // cosTheta: HdotV, F0: base reflectivity vector/scalar
  // F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0)
  const clampCos = Math.min(Math.max(1.0 - cosTheta, 0.0), 1.0);
  const pow5 = Math.pow(clampCos, 5.0);

  if (Array.isArray(F0)) {
    return F0.map((f) => f + (1.0 - f) * pow5);
  }
  return F0 + (1.0 - F0) * pow5;
}

describe('Renderer Shader Math Stress Tests', () => {
  it('should not produce NaN or Infinity in D_GGX under standard range and edge cases', () => {
    const roughnessValues = [0.08, 0.1, 0.5, 0.8, 1.0];
    const NdotHValues = [0.0, 0.1, 0.5, 0.9, 1.0];

    for (const r of roughnessValues) {
      for (const nh of NdotHValues) {
        const d = D_GGX(nh, r);
        expect(d).toBeLessThan(Infinity);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(d)).toBe(false);
      }
    }
  });

  it('should produce NaN/Infinity if roughness is exactly 0 and NdotH is exactly 1 (Vulnerability Verification)', () => {
    // Under roughness = 0 (perfect mirror), D_GGX should theoretically be a Dirac delta function.
    // In our discrete formula:
    // a2 = 0
    // denom = NdotH2 * (a2 - 1) + 1 = 1 * (-1) + 1 = 0
    // D_GGX = a2 / (pi * denom * denom) = 0 / 0 = NaN
    const d = D_GGX(1.0, 0.0);
    expect(Number.isNaN(d)).toBe(true); // Confirms the mathematical zero-roughness NaN vulnerability
  });

  it('should not produce NaN in G1_SchlickGGX under standard clamped ranges', () => {
    const roughnessValues = [0.08, 0.5, 1.0];
    const NdotVValues = [0.0001, 0.1, 0.5, 1.0]; // clamped in shader

    for (const r of roughnessValues) {
      for (const nv of NdotVValues) {
        const g1 = G1_SchlickGGX(nv, r);
        expect(g1).toBeLessThan(Infinity);
        expect(g1).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(g1)).toBe(false);
      }
    }
  });

  it('should evaluate Smith geometry attenuation correctly without division by zero', () => {
    const roughness = 0.08;
    const NdotV = 0.0001; // minimal clamped value
    const NdotL = 0.0; // can be 0.0 if light is behind surface

    const g = G_Smith(NdotV, NdotL, roughness);
    expect(g).toBe(0); // Should be 0 since NdotL is 0
    expect(Number.isNaN(g)).toBe(false);
  });

  it('should evaluate Fresnel-Schlick correctly and keep reflectivity bounded', () => {
    const F0 = [0.04, 0.04, 0.04];
    const cosThetaValues = [0.0, 0.5, 1.0];

    for (const cosTheta of cosThetaValues) {
      const f = F_Schlick(cosTheta, F0);
      expect(Array.isArray(f)).toBe(true);
      expect(f[0]).toBeLessThanOrEqual(1.0);
      expect(f[0]).toBeGreaterThanOrEqual(0.04);
      expect(Number.isNaN(f[0])).toBe(false);
    }
  });

  it('should evaluate the complete Cook-Torrance specular BRDF calculation without NaN', () => {
    // specular = (D * G * F) / (4.0 * NdotV * NdotL)
    // In shader: specularDenominator = 4.0 * NdotV * NdotL
    // specular = specularNumerator / max(specularDenominator, 0.001)
    const roughness = 0.08;
    const F0 = 0.04;

    // We will test various combinations of NdotL, NdotV, NdotH, HdotV
    const testCases = [
      { NdotV: 0.0001, NdotL: 0.0, NdotH: 0.5, HdotV: 0.5 },
      { NdotV: 1.0, NdotL: 1.0, NdotH: 1.0, HdotV: 1.0 },
      { NdotV: 0.0001, NdotL: 0.0001, NdotH: 0.0, HdotV: 0.0 },
      { NdotV: 0.5, NdotL: 0.5, NdotH: 0.0, HdotV: 0.5 },
    ];

    for (const tc of testCases) {
      const D = D_GGX(tc.NdotH, roughness);
      const G = G_Smith(tc.NdotV, tc.NdotL, roughness);
      const F = F_Schlick(tc.HdotV, F0);

      const numerator = D * G * F;
      const denominator = 4.0 * tc.NdotV * tc.NdotL;
      const specular = numerator / Math.max(denominator, 0.001);

      expect(specular).toBeLessThan(Infinity);
      expect(specular).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(specular)).toBe(false);
    }
  });
});
