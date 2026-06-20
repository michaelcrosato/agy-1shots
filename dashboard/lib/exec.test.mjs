// Unit tests for runScript's output-buffer and exit-code handling.
// Run from the dashboard dir: node lib/exec.test.mjs
//
// Regression guard for the bug where exec()'s 1 MB default buffer made a
// verbose-but-successful run fail with a STRING exitCode, so a passing one-shot
// (or acceptance test) was reported as failed.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runScript } from './exec.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-test-'));
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}
const node = (js) => `node -e "${js}"`;

try {
  await check('2 MB output succeeds and is fully captured (not truncated as failure)', async () => {
    const r = await runScript({
      id: 'big',
      targetDir: tmp,
      cmd: node("process.stdout.write('x'.repeat(2*1024*1024))"),
    });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.exitCode, 0);
    assert.ok(r.stdout.length >= 2 * 1024 * 1024, 'full 2 MB output should be captured');
  });

  await check('clean exit -> success, numeric exitCode 0', async () => {
    const r = await runScript({ id: 'ok', targetDir: tmp, cmd: node('process.exit(0)') });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.exitCode, 0);
  });

  await check('non-zero exit -> failure, numeric exit code preserved', async () => {
    const r = await runScript({ id: 'fail', targetDir: tmp, cmd: node('process.exit(5)') });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.exitCode, 5);
    assert.strictEqual(typeof r.exitCode, 'number');
  });

  await check('output beyond the cap -> numeric exitCode (string code coerced)', async () => {
    const r = await runScript({
      id: 'huge',
      targetDir: tmp,
      cmd: node("process.stdout.write('x'.repeat(12*1024*1024))"),
    });
    assert.strictEqual(r.success, false);
    assert.strictEqual(typeof r.exitCode, 'number'); // never the raw string code
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nexec.test.mjs: ALL ${passed} CHECKS PASSED`);
  process.exit(0);
} catch (err) {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
  console.error('\nexec.test.mjs: FAILED');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
