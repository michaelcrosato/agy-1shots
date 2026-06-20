import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { calculateCost } from './pricing.js';

// Per-one-shot "vision + metrics + evaluation" manifest.
//
// Each one-shot may carry a `oneshot.json` alongside its package.json:
//   - spec     : write-once. The immutable "vision" (expected outcome) + how to
//                evaluate fidelity. Never edited or deleted once a vision is set.
//   - attempts : append-only history. One entry per build/regeneration, capturing
//                generation cost, model, environment, and evaluation.
//
// The filesystem cannot enforce write-once / append-only, so the policy lives
// here: there is no path that edits a spec's vision or removes an attempt.

const ONE_SHOTS_DIR = path.resolve(process.cwd(), '../one-shots');
const MANIFEST_FILENAME = 'oneshot.json';
const SCHEMA_VERSION = 1;
const PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];
const ACCEPTANCE_MODES = ['human', 'program', 'none'];
const EVAL_METHODS = ['human', 'program', 'none'];

// Evidence provenance for attempt telemetry. The design review in
// tools/llm-usage-reader/DESIGN-rationale.md is unanimous: the LLM must never be
// the source of benchmark telemetry. Trusted token evidence comes only from
// provider reconciliation, native telemetry, or a local vendor session store.
// Token sources we trust for benchmark comparisons:
const TRUSTED_TOKEN_SOURCES = ['provider_reconciled', 'native_telemetry', 'vendor_session_store'];

// Classify an attempt's evidence. Attempts written by the evidence bridge
// (scripts/record-evidence.js) carry an `evidence` block; anything without one
// predates evidence-backed recording and is treated as legacy self-reported and
// NOT benchmark-eligible — without mutating the stored (append-only) record.
export function classifyAttempt(attempt) {
  const ev = attempt && attempt.evidence;
  if (ev && typeof ev === 'object' && typeof ev.evidenceLevel === 'string') {
    const tokensSource = typeof ev.tokensSource === 'string' ? ev.tokensSource : 'unavailable';
    const benchmarkEligible =
      typeof attempt.benchmarkEligible === 'boolean'
        ? attempt.benchmarkEligible
        : TRUSTED_TOKEN_SOURCES.includes(tokensSource);
    return { evidenceLevel: ev.evidenceLevel, tokensSource, benchmarkEligible };
  }
  return {
    evidenceLevel: 'legacy_self_reported',
    tokensSource: 'legacy_self_reported',
    benchmarkEligible: false,
  };
}

// Error carrying an HTTP status so routes can map failures uniformly.
export class ManifestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ManifestError';
    this.status = status;
  }
}

// Validates an id and resolves its on-disk location. Mirrors the inline gate
// used by /api/run, /api/polish, etc. Returns { ok, status?, targetDir?, ... }.
export function resolveOneShot(id) {
  if (typeof id !== 'string' || !id) {
    return { ok: false, status: 404 };
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    return { ok: false, status: 404 };
  }
  if (/[;&|`$]/.test(id)) {
    return { ok: false, status: 400 };
  }

  const targetDir = path.join(ONE_SHOTS_DIR, id);
  try {
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return { ok: false, status: 404 };
    }
  } catch (e) {
    return { ok: false, status: 404 };
  }

  return {
    ok: true,
    targetDir,
    manifestPath: path.join(targetDir, MANIFEST_FILENAME),
    pkgPath: path.join(targetDir, 'package.json'),
  };
}

export function emptyManifest() {
  return { schemaVersion: SCHEMA_VERSION, spec: null, attempts: [] };
}

function normalizeManifest(raw) {
  const out = emptyManifest();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (typeof raw.schemaVersion === 'number') {
      out.schemaVersion = raw.schemaVersion;
    }
    if (raw.spec && typeof raw.spec === 'object' && !Array.isArray(raw.spec)) {
      out.spec = raw.spec;
    }
    if (Array.isArray(raw.attempts)) {
      out.attempts = raw.attempts.filter((a) => a && typeof a === 'object' && !Array.isArray(a));
    }
  }
  return out;
}

// Async read. Missing or corrupt manifest is NOT an error — returns the empty
// default (matching the "missing README" behaviour of the readme route).
export async function readManifest(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  try {
    const raw = await fsp.readFile(manifestPath, 'utf8');
    return normalizeManifest(JSON.parse(raw));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Error reading manifest:', manifestPath, e.message);
    }
    return emptyManifest();
  }
}

// Synchronous read, for the sync scan/page code paths.
export function readManifestSync(targetDir) {
  return readManifestSyncWithStatus(targetDir).manifest;
}

// Read + classify: "missing" (no file / ENOENT), "valid", "corrupt"
// (unparseable JSON), or "unreadable" (a transient I/O error on a file that
// does exist). Distinguishing "unreadable" from "missing" is critical: writers
// refuse to overwrite on "unreadable"/"corrupt", so a momentary read failure
// can never wipe the append-only history — recorded data is never lost unnoticed.
export function readManifestSyncWithStatus(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (e) {
    // Only a genuinely absent file is "missing". A transient error
    // (EACCES/EMFILE/EBUSY/EPERM/EISDIR) must NOT masquerade as missing.
    return { manifest: emptyManifest(), status: e.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  try {
    return { manifest: normalizeManifest(JSON.parse(raw)), status: 'valid' };
  } catch (e) {
    return { manifest: emptyManifest(), status: 'corrupt' };
  }
}

export async function readManifestWithStatus(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  let raw;
  try {
    raw = await fsp.readFile(manifestPath, 'utf8');
  } catch (e) {
    // Only ENOENT is "missing"; any other read error is "unreadable" so writers
    // refuse to overwrite (see readManifestSyncWithStatus).
    return { manifest: emptyManifest(), status: e.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  try {
    return { manifest: normalizeManifest(JSON.parse(raw)), status: 'valid' };
  } catch (e) {
    return { manifest: emptyManifest(), status: 'corrupt' };
  }
}

// Compact summary attached to scan results / cards.
export function summarizeManifest(m, status = 'valid') {
  const spec = m && m.spec;
  const attempts = m && Array.isArray(m.attempts) ? m.attempts : [];
  const hasVision = !!(spec && typeof spec.vision === 'string' && spec.vision.trim());
  const attemptCount = attempts.length;
  const latest = attemptCount > 0 ? attempts[attemptCount - 1] : null;
  const evaluation = latest && latest.evaluation ? latest.evaluation : null;

  const benchmarkEligibleCount = attempts.filter((a) => classifyAttempt(a).benchmarkEligible).length;

  return {
    hasManifest: hasVision || attemptCount > 0,
    manifestStatus: status,
    hasVision,
    attemptCount,
    benchmarkEligibleCount,
    latestEvidenceLevel: latest ? classifyAttempt(latest).evidenceLevel : null,
    latestFidelity:
      evaluation && typeof evaluation.fidelityScore === 'number' ? evaluation.fidelityScore : null,
    latestPassed: evaluation && typeof evaluation.passed === 'boolean' ? evaluation.passed : null,
    latestModel: latest && typeof latest.model === 'string' ? latest.model : null,
  };
}

// --- Atomic write with per-path serialization (ported from lib/stats.js) ---

const writeQueues = new Map();

function runInQueue(key, fn) {
  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev.then(fn);
  const settled = next.catch(() => {});
  writeQueues.set(key, settled);
  // Evict the key once this op drains and nothing newer chained after it,
  // so the map stays flat instead of growing one entry per manifest path.
  settled.then(() => {
    if (writeQueues.get(key) === settled) {
      writeQueues.delete(key);
    }
  });
  return next;
}

async function atomicWrite(manifestPath, data) {
  const dir = path.dirname(manifestPath);
  const base = path.basename(manifestPath);
  const uniqueTmpPath = path.join(
    dir,
    `${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2)}`
  );
  let created = false;
  try {
    await fsp.writeFile(uniqueTmpPath, JSON.stringify(data, null, 2), 'utf8');
    created = true;

    let attempts = 5;
    while (attempts > 0) {
      try {
        await fsp.rename(uniqueTmpPath, manifestPath);
        break;
      } catch (err) {
        attempts--;
        if (attempts === 0) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  } catch (e) {
    if (created) {
      try {
        await fsp.unlink(uniqueTmpPath);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.error('Error cleaning up temp manifest:', unlinkErr.message);
        }
      }
    }
    throw e;
  }
}

// Read-modify-write a manifest atomically. `mutator(current)` returns the new
// manifest (and may throw ManifestError to abort without writing). The whole
// cycle runs inside the per-path queue so concurrent appends never race.
export function updateManifest(targetDir, manifestPath, mutator) {
  return runInQueue(manifestPath, async () => {
    const lockPath = path.join(targetDir, 'oneshot.json.lock');
    let hasLock = false;

    // Acquire directory lock (max 20 retries with 50ms sleep)
    for (let i = 0; i < 20; i++) {
      try {
        await fsp.mkdir(lockPath);
        hasLock = true;
        break;
      } catch (err) {
        if (err.code === 'EEXIST') {
          await new Promise((resolve) => setTimeout(resolve, 50));
        } else {
          throw err;
        }
      }
    }

    if (!hasLock) {
      throw new ManifestError(
        503,
        'Concurrency conflict: Could not acquire write lock on manifest. Please try again.'
      );
    }

    try {
      const { manifest: current, status } = await readManifestWithStatus(targetDir);
      if (status === 'corrupt') {
        throw new ManifestError(
          409,
          'Manifest file is unreadable (corrupt JSON); refusing to overwrite to avoid data loss. Fix or remove oneshot.json and retry.'
        );
      }
      if (status === 'unreadable') {
        // A transient read error (not ENOENT, not corrupt). Refuse to overwrite
        // so a momentary I/O failure can't clobber the append-only history.
        throw new ManifestError(
          503,
          'Manifest file could not be read (transient I/O error); refusing to overwrite to avoid data loss. Please retry.'
        );
      }
      const updated = await mutator(current);
      await atomicWrite(manifestPath, updated);
      return updated;
    } finally {
      if (hasLock) {
        try {
          await fsp.rmdir(lockPath);
        } catch (err) {
          // Ignore lock removal failure
        }
      }
    }
  });
}

// --- Validation helpers (throw ManifestError(400) on bad input) ---

function assertNoProtoKeys(obj, label) {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (PROTO_KEYS.includes(key)) {
        throw new ManifestError(400, `Prototype pollution detected in ${label}`);
      }
    }
  }
}

function normalizeNonNegInt(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ManifestError(400, `${label} must be a non-negative number`);
  }
  return Math.round(n);
}

function normalizeStringMap(obj, allowed, label) {
  const out = {};
  if (obj === undefined || obj === null) {
    return out;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ManifestError(400, `${label} must be an object`);
  }
  assertNoProtoKeys(obj, label);
  for (const key of allowed) {
    const val = obj[key];
    if (val === undefined || val === null) {
      out[key] = '';
    } else if (typeof val === 'string') {
      out[key] = val;
    } else {
      throw new ManifestError(400, `${label}.${key} must be a string`);
    }
  }
  return out;
}

export function validateSpecInput(body) {
  assertNoProtoKeys(body, 'spec');
  if (typeof body.vision !== 'string' || !body.vision.trim()) {
    throw new ManifestError(400, 'vision is required and must be a non-empty string');
  }
  if (body.vision.length > 20000) {
    throw new ManifestError(400, 'vision is too long');
  }

  let mode = 'human';
  let script = 'verify';
  let successExitCode = 0;

  if (body.acceptance !== undefined && body.acceptance !== null) {
    const a = body.acceptance;
    if (typeof a !== 'object' || Array.isArray(a)) {
      throw new ManifestError(400, 'acceptance must be an object');
    }
    assertNoProtoKeys(a, 'acceptance');
    if (a.mode !== undefined) {
      if (!ACCEPTANCE_MODES.includes(a.mode)) {
        throw new ManifestError(
          400,
          `acceptance.mode must be one of ${ACCEPTANCE_MODES.join(', ')}`
        );
      }
      mode = a.mode;
    }
    if (a.script !== undefined && a.script !== null) {
      if (typeof a.script !== 'string' || !a.script.trim()) {
        throw new ManifestError(400, 'acceptance.script must be a non-empty string');
      }
      script = a.script.trim();
    }
    if (a.successExitCode !== undefined && a.successExitCode !== null) {
      const code = Number(a.successExitCode);
      if (!Number.isInteger(code)) {
        throw new ManifestError(400, 'acceptance.successExitCode must be an integer');
      }
      successExitCode = code;
    }
  }

  return {
    vision: body.vision.trim(),
    acceptance: { mode, script, successExitCode },
  };
}

export function validateAttemptInput(body) {
  assertNoProtoKeys(body, 'attempt');

  let model = '';
  if (body.model !== undefined && body.model !== null) {
    if (typeof body.model !== 'string') {
      throw new ManifestError(400, 'model must be a string');
    }
    model = body.model;
  }

  const environment = normalizeStringMap(
    body.environment,
    ['tool', 'toolBuild', 'os', 'osBuild', 'speed', 'effort'],
    'environment'
  );

  const normalizeCost = (obj, label) => {
    if (obj === undefined || obj === null) {
      return { tokens: null, durationMs: null };
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ManifestError(400, `${label} must be an object`);
    }
    assertNoProtoKeys(obj, label);
    return {
      tokens: normalizeNonNegInt(obj.tokens, `${label}.tokens`),
      durationMs: normalizeNonNegInt(obj.durationMs, `${label}.durationMs`),
    };
  };

  const evaluation =
    body.evaluation !== undefined && body.evaluation !== null
      ? validateEvaluationInput(body.evaluation)
      : emptyEvaluation();

  return {
    model,
    environment,
    build: normalizeCost(body.build, 'build'),
    evaluation,
  };
}

export function emptyEvaluation() {
  return {
    method: 'none',
    fidelityScore: null,
    passed: null,
    feedback: '',
    evaluatedAt: null,
  };
}

export function validateEvaluationInput(body) {
  assertNoProtoKeys(body, 'evaluation');

  let method = 'human';
  if (body.method !== undefined && body.method !== null) {
    if (!EVAL_METHODS.includes(body.method)) {
      throw new ManifestError(400, `evaluation.method must be one of ${EVAL_METHODS.join(', ')}`);
    }
    method = body.method;
  }

  let fidelityScore = null;
  if (
    body.fidelityScore !== undefined &&
    body.fidelityScore !== null &&
    body.fidelityScore !== ''
  ) {
    const n = Number(body.fidelityScore);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new ManifestError(400, 'fidelityScore must be a number between 0 and 100');
    }
    fidelityScore = Math.round(n);
  }

  let passed = null;
  if (body.passed !== undefined && body.passed !== null) {
    if (typeof body.passed !== 'boolean') {
      throw new ManifestError(400, 'passed must be a boolean');
    }
    passed = body.passed;
  }

  let feedback = '';
  if (body.feedback !== undefined && body.feedback !== null) {
    if (typeof body.feedback !== 'string') {
      throw new ManifestError(400, 'feedback must be a string');
    }
    if (body.feedback.length > 20000) {
      throw new ManifestError(400, 'feedback is too long');
    }
    feedback = body.feedback;
  }

  return { method, fidelityScore, passed, feedback };
}

export function generateAttemptId() {
  return `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function decorateAttempt(attempt) {
  if (!attempt) return attempt;
  const buildTokens = attempt.build ? attempt.build.tokens : null;
  const buildCost = calculateCost(attempt.model, buildTokens);
  const { evidenceLevel, tokensSource, benchmarkEligible } = classifyAttempt(attempt);
  return {
    ...attempt,
    build: {
      ...attempt.build,
      estimatedCost: buildCost,
    },
    estimatedCost: buildCost !== null ? Number(buildCost.toFixed(4)) : null,
    // Computed provenance (does not mutate the stored, append-only record).
    evidenceLevel,
    tokensSource,
    benchmarkEligible,
  };
}

export function decorateManifest(manifest) {
  if (!manifest) return manifest;
  const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
  return {
    ...manifest,
    attempts: attempts.map(decorateAttempt),
  };
}
