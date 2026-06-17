import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";

// Per-one-shot "vision + metrics + evaluation" manifest.
//
// Each one-shot may carry a `oneshot.json` alongside its package.json:
//   - spec     : write-once. The immutable "vision" (expected outcome) + how to
//                evaluate fidelity. Never edited or deleted once a vision is set.
//   - attempts : append-only history. One entry per build/regeneration, capturing
//                generation cost, runtime cost, model, environment, and evaluation.
//
// The filesystem cannot enforce write-once / append-only, so the policy lives
// here: there is no path that edits a spec's vision or removes an attempt.

const ONE_SHOTS_DIR = path.resolve(process.cwd(), "../one-shots");
const MANIFEST_FILENAME = "oneshot.json";
const SCHEMA_VERSION = 1;
const PROTO_KEYS = ["__proto__", "constructor", "prototype"];
const ACCEPTANCE_MODES = ["human", "program", "none"];
const EVAL_METHODS = ["human", "program", "none"];

// Error carrying an HTTP status so routes can map failures uniformly.
export class ManifestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ManifestError";
    this.status = status;
  }
}

// Validates an id and resolves its on-disk location. Mirrors the inline gate
// used by /api/run, /api/polish, etc. Returns { ok, status?, targetDir?, ... }.
export function resolveOneShot(id) {
  if (typeof id !== "string" || !id) {
    return { ok: false, status: 404 };
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
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
    pkgPath: path.join(targetDir, "package.json"),
  };
}

export function emptyManifest() {
  return { schemaVersion: SCHEMA_VERSION, spec: null, attempts: [] };
}

function normalizeManifest(raw) {
  const out = emptyManifest();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (typeof raw.schemaVersion === "number") {
      out.schemaVersion = raw.schemaVersion;
    }
    if (raw.spec && typeof raw.spec === "object" && !Array.isArray(raw.spec)) {
      out.spec = raw.spec;
    }
    if (Array.isArray(raw.attempts)) {
      out.attempts = raw.attempts.filter(
        (a) => a && typeof a === "object" && !Array.isArray(a),
      );
    }
  }
  return out;
}

// Async read. Missing or corrupt manifest is NOT an error — returns the empty
// default (matching the "missing README" behaviour of the readme route).
export async function readManifest(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  try {
    const raw = await fsp.readFile(manifestPath, "utf8");
    return normalizeManifest(JSON.parse(raw));
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error("Error reading manifest:", manifestPath, e.message);
    }
    return emptyManifest();
  }
}

// Synchronous read, for the sync scan/page code paths.
export function readManifestSync(targetDir) {
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    return normalizeManifest(JSON.parse(raw));
  } catch (e) {
    return emptyManifest();
  }
}

// Compact summary attached to scan results / cards.
export function summarizeManifest(m) {
  const spec = m && m.spec;
  const attempts = m && Array.isArray(m.attempts) ? m.attempts : [];
  const hasVision = !!(
    spec &&
    typeof spec.vision === "string" &&
    spec.vision.trim()
  );
  const attemptCount = attempts.length;
  const latest = attemptCount > 0 ? attempts[attemptCount - 1] : null;
  const evaluation = latest && latest.evaluation ? latest.evaluation : null;

  return {
    hasManifest: hasVision || attemptCount > 0,
    hasVision,
    attemptCount,
    latestFidelity:
      evaluation && typeof evaluation.fidelityScore === "number"
        ? evaluation.fidelityScore
        : null,
    latestPassed:
      evaluation && typeof evaluation.passed === "boolean"
        ? evaluation.passed
        : null,
    latestModel:
      latest && typeof latest.model === "string" ? latest.model : null,
  };
}

// --- Atomic write with per-path serialization (ported from lib/stats.js) ---

const writeQueues = new Map();

function runInQueue(key, fn) {
  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev.then(fn);
  writeQueues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

async function atomicWrite(manifestPath, data) {
  const dir = path.dirname(manifestPath);
  const base = path.basename(manifestPath);
  const uniqueTmpPath = path.join(
    dir,
    `${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2)}`,
  );
  let created = false;
  try {
    await fsp.writeFile(uniqueTmpPath, JSON.stringify(data, null, 2), "utf8");
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
        if (unlinkErr.code !== "ENOENT") {
          console.error("Error cleaning up temp manifest:", unlinkErr.message);
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
    const current = await readManifest(targetDir);
    const updated = await mutator(current);
    await atomicWrite(manifestPath, updated);
    return updated;
  });
}

// --- Validation helpers (throw ManifestError(400) on bad input) ---

function assertNoProtoKeys(obj, label) {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (PROTO_KEYS.includes(key)) {
        throw new ManifestError(
          400,
          `Prototype pollution detected in ${label}`,
        );
      }
    }
  }
}

function normalizeNonNegInt(value, label) {
  if (value === undefined || value === null || value === "") {
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
  if (typeof obj !== "object" || Array.isArray(obj)) {
    throw new ManifestError(400, `${label} must be an object`);
  }
  assertNoProtoKeys(obj, label);
  for (const key of allowed) {
    const val = obj[key];
    if (val === undefined || val === null) {
      out[key] = "";
    } else if (typeof val === "string") {
      out[key] = val;
    } else {
      throw new ManifestError(400, `${label}.${key} must be a string`);
    }
  }
  return out;
}

export function validateSpecInput(body) {
  assertNoProtoKeys(body, "spec");
  if (typeof body.vision !== "string" || !body.vision.trim()) {
    throw new ManifestError(400, "vision is required and must be a non-empty string");
  }
  if (body.vision.length > 20000) {
    throw new ManifestError(400, "vision is too long");
  }

  let mode = "human";
  let script = "verify";
  let successExitCode = 0;

  if (body.acceptance !== undefined && body.acceptance !== null) {
    const a = body.acceptance;
    if (typeof a !== "object" || Array.isArray(a)) {
      throw new ManifestError(400, "acceptance must be an object");
    }
    assertNoProtoKeys(a, "acceptance");
    if (a.mode !== undefined) {
      if (!ACCEPTANCE_MODES.includes(a.mode)) {
        throw new ManifestError(
          400,
          `acceptance.mode must be one of ${ACCEPTANCE_MODES.join(", ")}`,
        );
      }
      mode = a.mode;
    }
    if (a.script !== undefined && a.script !== null) {
      if (typeof a.script !== "string" || !a.script.trim()) {
        throw new ManifestError(400, "acceptance.script must be a non-empty string");
      }
      script = a.script.trim();
    }
    if (a.successExitCode !== undefined && a.successExitCode !== null) {
      const code = Number(a.successExitCode);
      if (!Number.isInteger(code)) {
        throw new ManifestError(400, "acceptance.successExitCode must be an integer");
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
  assertNoProtoKeys(body, "attempt");

  let model = "";
  if (body.model !== undefined && body.model !== null) {
    if (typeof body.model !== "string") {
      throw new ManifestError(400, "model must be a string");
    }
    model = body.model;
  }

  const environment = normalizeStringMap(
    body.environment,
    ["tool", "toolBuild", "os", "osBuild"],
    "environment",
  );

  const normalizeCost = (obj, label) => {
    if (obj === undefined || obj === null) {
      return { tokens: null, durationMs: null };
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
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
    build: normalizeCost(body.build, "build"),
    runtime: normalizeCost(body.runtime, "runtime"),
    evaluation,
  };
}

export function emptyEvaluation() {
  return {
    method: "none",
    fidelityScore: null,
    passed: null,
    feedback: "",
    evaluatedAt: null,
  };
}

export function validateEvaluationInput(body) {
  assertNoProtoKeys(body, "evaluation");

  let method = "human";
  if (body.method !== undefined && body.method !== null) {
    if (!EVAL_METHODS.includes(body.method)) {
      throw new ManifestError(
        400,
        `evaluation.method must be one of ${EVAL_METHODS.join(", ")}`,
      );
    }
    method = body.method;
  }

  let fidelityScore = null;
  if (body.fidelityScore !== undefined && body.fidelityScore !== null && body.fidelityScore !== "") {
    const n = Number(body.fidelityScore);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new ManifestError(400, "fidelityScore must be a number between 0 and 100");
    }
    fidelityScore = Math.round(n);
  }

  let passed = null;
  if (body.passed !== undefined && body.passed !== null) {
    if (typeof body.passed !== "boolean") {
      throw new ManifestError(400, "passed must be a boolean");
    }
    passed = body.passed;
  }

  let feedback = "";
  if (body.feedback !== undefined && body.feedback !== null) {
    if (typeof body.feedback !== "string") {
      throw new ManifestError(400, "feedback must be a string");
    }
    if (body.feedback.length > 20000) {
      throw new ManifestError(400, "feedback is too long");
    }
    feedback = body.feedback;
  }

  return { method, fidelityScore, passed, feedback };
}

export function generateAttemptId() {
  return `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
