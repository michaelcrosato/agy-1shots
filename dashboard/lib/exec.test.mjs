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
import { runScript, sanitizeEnv, detectCommandEscape } from './exec.js';

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

  // --- sanitizeEnv: strips env keys that can hijack process startup ---

  await check('sanitizeEnv strips dangerous keys, keeps safe vars, case-insensitively', () => {
    const out = sanitizeEnv({
      NODE_OPTIONS: '--require /tmp/evil.js',
      node_options: '--inspect', // lowercase must be stripped too
      LD_PRELOAD: '/tmp/x.so',
      BASH_ENV: '/tmp/rc',
      PATH: '/evil/bin',
      SAFE_VAR: 'keep-me',
    });
    assert.deepStrictEqual(out, { SAFE_VAR: 'keep-me' });
  });

  await check('sanitizeEnv on a non-object returns an empty object', () => {
    assert.deepStrictEqual(sanitizeEnv(null), {});
    assert.deepStrictEqual(sanitizeEnv(undefined), {});
    assert.deepStrictEqual(sanitizeEnv('NODE_OPTIONS=x'), {});
  });

  // --- detectCommandEscape: blocks reads/writes outside the one-shot dir ---

  await check('detectCommandEscape blocks relative .. traversal, allows an in-dir command', () => {
    assert.strictEqual(detectCommandEscape('node ../../outside.js', tmp), true);
    assert.strictEqual(detectCommandEscape('node index.js', tmp), false);
  });

  await check('detectCommandEscape blocks an absolute path outside the target dir', () => {
    const outside =
      process.platform === 'win32' ? 'node C:\\Windows\\system32\\x.js' : 'node /etc/passwd';
    assert.strictEqual(detectCommandEscape(outside, tmp), true);
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
