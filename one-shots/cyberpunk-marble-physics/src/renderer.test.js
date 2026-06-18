import { describe, it, expect } from 'vitest';
import { neonGridShader, distancePbrShader } from './renderer.js';

describe('Renderer Shader Definitions', () => {
  it('should export valid neonGridShader vertex and fragment source code', () => {
    expect(neonGridShader).toBeDefined();
    expect(neonGridShader.vertexShader).toContain('void main');
    expect(neonGridShader.fragmentShader).toContain('void main');
    expect(neonGridShader.fragmentShader).toContain('fwidth');
  });

  it('should export valid distancePbrShader vertex and fragment source code', () => {
    expect(distancePbrShader).toBeDefined();
    expect(distancePbrShader.vertexShader).toContain('void main');
    expect(distancePbrShader.fragmentShader).toContain('void main');
    expect(distancePbrShader.fragmentShader).toContain('D_GGX');
    expect(distancePbrShader.fragmentShader).toContain('G_Smith');
    expect(distancePbrShader.fragmentShader).toContain('F_Schlick');
  });
});
