/**
 * Unit tests for lib/atomic-file.js — run by tests/run-unit.js.
 *   node dashboard/lib/atomic-file.test.mjs   (from the dashboard/ dir)
 *
 * No test framework: assert + a tiny pass/fail tally, matching the sibling
 * lib/*.test.mjs suites.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic-file.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-file-'));

function leftoverTemps(dir, base) {
  return fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.tmp.`));
}

test('writes new file with exact contents', () => {
  const target = path.join(tmpRoot, 'a', 'data.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = JSON.stringify({ hello: 'world', n: 1 }, null, 2);
  writeFileAtomic(target, payload);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), payload);
  assert.deepStrictEqual(leftoverTemps(path.dirname(target), 'data.json'), []);
});

test('overwrites an existing file in place', () => {
  const target = path.join(tmpRoot, 'b', 'reg.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'OLD CONTENT', 'utf8');
  writeFileAtomic(target, 'NEW CONTENT');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'NEW CONTENT');
  assert.deepStrictEqual(leftoverTemps(path.dirname(target), 'reg.json'), []);
});

test('preserves the original file when the rename fails (no data loss, no temp leak)', () => {
  // Simulate an unwritable target by making the destination a directory: the
  // temp file writes fine, but renaming a file over an existing directory
  // fails — the original must survive and no temp file may be left behind.
  const dir = path.join(tmpRoot, 'c');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'busy');
  fs.mkdirSync(target); // target path is a directory -> rename(file, dir) throws
  let threw = false;
  try {
    writeFileAtomic(target, 'should not land');
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, true, 'expected writeFileAtomic to throw on rename failure');
  assert.strictEqual(fs.existsSync(target) && fs.statSync(target).isDirectory(), true);
  assert.deepStrictEqual(leftoverTemps(dir, 'busy'), [], 'temp file must be cleaned up');
});

test('concurrent-style repeated writes never collide on temp names', () => {
  const target = path.join(tmpRoot, 'd', 'multi.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (let i = 0; i < 50; i++) {
    writeFileAtomic(target, `value-${i}`);
  }
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'value-49');
  assert.deepStrictEqual(leftoverTemps(path.dirname(target), 'multi.json'), []);
});

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log(`\natomic-file: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
