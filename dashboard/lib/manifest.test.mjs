// Unit tests for manifest read-classification + the write-path data-loss guard.
// Run from the dashboard dir: node lib/manifest.test.mjs
//
// Regression guard for the bug where a transient (non-ENOENT) read error was
// classified "missing", letting updateManifest overwrite a real append-only
// manifest with an empty one. A directory named oneshot.json deterministically
// triggers a non-ENOENT read error (EISDIR) on every OS.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readManifestSyncWithStatus,
  updateManifest,
  ManifestError,
  validateStrategy,
  validateInteraction,
  validateObservationsInput,
  validateAttemptInput,
} from './manifest.js';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
function rm(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
}
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function mkCase(name) {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, manifestPath: path.join(dir, 'oneshot.json') };
}

try {
  // --- A transient (non-ENOENT) read error: oneshot.json is a DIRECTORY ---
  const bad = mkCase('unreadable');
  fs.mkdirSync(bad.manifestPath); // reading this path throws EISDIR, not ENOENT

  check('non-ENOENT read error -> status "unreadable" (not "missing")', () => {
    assert.strictEqual(readManifestSyncWithStatus(bad.dir).status, 'unreadable');
  });

  await checkAsync(
    'updateManifest refuses to overwrite on "unreadable" (no data loss)',
    async () => {
      let threw = null;
      try {
        await updateManifest(bad.dir, bad.manifestPath, (m) => {
          m.attempts.push({ id: 'should-not-be-written' });
          return m;
        });
      } catch (e) {
        threw = e;
      }
      assert.ok(threw instanceof ManifestError, 'expected a ManifestError');
      assert.strictEqual(threw.status, 503);
      assert.ok(fs.statSync(bad.manifestPath).isDirectory(), 'oneshot.json must be left intact');
    }
  );

  // --- Genuinely missing file (ENOENT) still behaves as before ---
  const miss = mkCase('missing');
  check('genuinely absent file -> status "missing"', () => {
    assert.strictEqual(readManifestSyncWithStatus(miss.dir).status, 'missing');
  });
  await checkAsync('updateManifest creates a manifest when genuinely missing', async () => {
    await updateManifest(miss.dir, miss.manifestPath, (m) => {
      m.attempts.push({ id: 'a1' });
      return m;
    });
    const written = JSON.parse(fs.readFileSync(miss.manifestPath, 'utf8'));
    assert.strictEqual(written.attempts.length, 1);
    assert.strictEqual(written.attempts[0].id, 'a1');
  });

  // --- Valid file: append preserves existing data ---
  const ok = mkCase('valid');
  fs.writeFileSync(
    ok.manifestPath,
    JSON.stringify({ schemaVersion: 1, spec: null, attempts: [{ id: 'old' }] })
  );
  check('valid file -> status "valid"', () => {
    const { status, manifest } = readManifestSyncWithStatus(ok.dir);
    assert.strictEqual(status, 'valid');
    assert.strictEqual(manifest.attempts.length, 1);
  });
  await checkAsync('updateManifest appends to a valid manifest without losing data', async () => {
    await updateManifest(ok.dir, ok.manifestPath, (m) => {
      m.attempts.push({ id: 'new' });
      return m;
    });
    const written = JSON.parse(fs.readFileSync(ok.manifestPath, 'utf8'));
    assert.deepStrictEqual(
      written.attempts.map((a) => a.id),
      ['old', 'new']
    );
  });

  // --- Learning-layer validators (strategy / interaction / observations) ---
  check('validateStrategy trims and returns null for empty', () => {
    assert.strictEqual(validateStrategy('  plan-first '), 'plan-first');
    assert.strictEqual(validateStrategy(''), null);
    assert.strictEqual(validateStrategy(undefined), null);
    assert.strictEqual(validateStrategy(null), null);
  });
  check('validateStrategy rejects non-strings and oversized values', () => {
    assert.throws(() => validateStrategy(42), ManifestError);
    assert.throws(() => validateStrategy('x'.repeat(201)), ManifestError);
  });
  check('validateInteraction derives oneShot from userPrompts', () => {
    assert.deepStrictEqual(validateInteraction({ userPrompts: 1 }), {
      userPrompts: 1,
      oneShot: true,
      source: 'transcript',
    });
    assert.deepStrictEqual(validateInteraction({ userPrompts: 4, source: 'transcript' }), {
      userPrompts: 4,
      oneShot: false,
      source: 'transcript',
    });
    assert.strictEqual(validateInteraction(undefined), null);
    assert.strictEqual(validateInteraction({}), null);
  });
  check('validateInteraction rejects bad shapes', () => {
    assert.throws(() => validateInteraction([]), ManifestError);
    assert.throws(() => validateInteraction({ userPrompts: -2 }), ManifestError);
    assert.throws(() => validateInteraction({ userPrompts: 1, oneShot: 'yes' }), ManifestError);
  });
  check('validateObservationsInput normalizes lists and nulls when empty', () => {
    const obs = validateObservationsInput({
      wentWell: [' scaffolding worked '],
      struggled: [],
      lessons: ['GLSL needed fixes', ''],
    });
    assert.deepStrictEqual(obs, {
      wentWell: ['scaffolding worked'],
      struggled: [],
      lessons: ['GLSL needed fixes'],
    });
    assert.strictEqual(validateObservationsInput({ wentWell: [], lessons: [] }), null);
    assert.strictEqual(validateObservationsInput(undefined), null);
  });
  check('validateObservationsInput rejects bad shapes', () => {
    assert.throws(() => validateObservationsInput({ wentWell: 'not-a-list' }), ManifestError);
    assert.throws(() => validateObservationsInput({ lessons: [42] }), ManifestError);
    assert.throws(() => validateObservationsInput({ lessons: ['x'.repeat(501)] }), ManifestError);
    assert.throws(
      () => validateObservationsInput({ wentWell: Array.from({ length: 21 }, () => 'a') }),
      ManifestError
    );
  });
  check('validateAttemptInput passes learning fields through when present', () => {
    const fields = validateAttemptInput({
      model: 'test-model',
      strategy: 'plan-first',
      interaction: { userPrompts: 2 },
      observations: { lessons: ['a lesson'] },
    });
    assert.strictEqual(fields.strategy, 'plan-first');
    assert.deepStrictEqual(fields.interaction, {
      userPrompts: 2,
      oneShot: false,
      source: 'transcript',
    });
    assert.deepStrictEqual(fields.observations.lessons, ['a lesson']);
    assert.ok(typeof fields.observations.notedAt === 'string');
    const bare = validateAttemptInput({ model: 'test-model' });
    assert.ok(!('strategy' in bare) && !('interaction' in bare) && !('observations' in bare));
  });

  rm(tmpBase);
  console.log(`\nmanifest.test.mjs: ALL ${passed} CHECKS PASSED`);
  process.exit(0);
} catch (err) {
  try {
    rm(tmpBase);
  } catch (e) {
    /* ignore */
  }
  console.error('\nmanifest.test.mjs: FAILED');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
