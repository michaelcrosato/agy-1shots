#!/usr/bin/env node
/**
 * Runs every standalone unit suite and exits non-zero if any fail.
 *   node tests/run-unit.js
 *
 * These suites are fast and need no running server (unlike the e2e gate in
 * tests/e2e/verify.js, which boots the dashboard). The e2e gate runs this first
 * so a broken unit invariant fails fast before the expensive build.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const suites = [
  { name: 'record-build', file: 'tests/record-build.test.js', cwd: repoRoot },
  // These .mjs suites import dashboard ESM modules, so run from dashboard/.
  { name: 'pricing', file: 'lib/pricing.test.mjs', cwd: path.join(repoRoot, 'dashboard') },
  { name: 'manifest', file: 'lib/manifest.test.mjs', cwd: path.join(repoRoot, 'dashboard') },
  { name: 'exec', file: 'lib/exec.test.mjs', cwd: path.join(repoRoot, 'dashboard') },
  { name: 'atomic-file', file: 'lib/atomic-file.test.mjs', cwd: path.join(repoRoot, 'dashboard') },
];

let failed = 0;
for (const s of suites) {
  console.log(`\n--- ${s.name} ---`);
  const res = spawnSync(process.execPath, [s.file], { cwd: s.cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    failed += 1;
    console.error(`[FAIL] ${s.name} (exit ${res.status})`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} unit suite(s) failed.`);
  process.exit(1);
}
console.log('\nAll unit suites passed.');
