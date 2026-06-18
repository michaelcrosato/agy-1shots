import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Starting Cyberpunk Marble-Physics Acceptance Verification (Stub) ===');

try {
  // 1. Structure Verification: Assert critical configuration and doc files exist
  const criticalFiles = ['package.json', 'oneshot.json', 'vite.config.js', 'README.md'];

  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Structure Violation: Missing critical file ${file}`);
    }
    console.log(`[PASS] Found file: ${file}`);
  }

  // 2. Configuration Integrity: Read and validate package.json dependencies
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  if (
    !pkg.dependencies ||
    !pkg.dependencies['three'] ||
    !pkg.dependencies['@dimforge/rapier3d-compat']
  ) {
    throw new Error(
      'Config Violation: package.json missing required dependencies (three or @dimforge/rapier3d-compat)'
    );
  }
  console.log('[PASS] package.json contains all required dependencies.');

  // 3. Compile Verification
  console.log('Running compile verification (npm run build)...');
  execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  console.log('[PASS] Compile Verification (npm run build) succeeded.');

  // 4. Distribution Asset Verification
  console.log('Checking built assets...');
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('Distribution Violation: dist/ directory not found after build.');
  }
  const filesInDist = fs.readdirSync(distDir);
  if (filesInDist.length === 0) {
    throw new Error('Distribution Violation: dist/ directory is empty.');
  }
  // Check that the rapier wasm file is copied into dist/
  const wasmExists = filesInDist.some((f) => f.endsWith('.wasm'));
  if (!wasmExists) {
    throw new Error('Distribution Violation: rapier_wasm3d_bg.wasm not found in dist/');
  }
  console.log('[PASS] Distribution assets verified successfully.');

  console.log('=== Verification Passed Successfully ===');
  process.exit(0);
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.error('\n[FAIL] Verification Failed:', errMsg);
  process.exit(1);
}
