#!/usr/bin/env node

/**
 * record-evidence.js — evidence-backed attempt finalizer.
 *
 * Reads a record from the llm-usage-reader ledger (data/usage-ledger.jsonl) and
 * appends an evidence-backed attempt to a one-shot's oneshot.json. This is the
 * trusted path: token/timing/host facts come from the recorder's ledger, never
 * from an agent or a human typing numbers into a manifest.
 *
 * Why this exists: see tools/llm-usage-reader/DESIGN-rationale.md. The LLM must
 * never be the source of benchmark telemetry. The legacy scripts/record-attempt.js
 * self-report path still works but is now stamped manual_attestation /
 * benchmarkEligible:false.
 *
 * Usage:
 *   node scripts/record-evidence.js --id <one-shot> [--latest]
 *   node scripts/record-evidence.js --id <one-shot> --record-id rec_xxx
 *   node scripts/record-evidence.js --id <one-shot> --run-id run_xxx
 *   node scripts/record-evidence.js --id <one-shot> --ledger <path>
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const RECORDER = 'llm-usage-reader';
const RECORDER_VERSION = '0.1.0';
const TRUSTED_TOKEN_SOURCES = ['provider_reconciled', 'native_telemetry', 'vendor_session_store'];

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// Map a ledger record's source.type to an evidence classification.
function deriveEvidence(rec) {
  const sourceType = rec.source && typeof rec.source.type === 'string' ? rec.source.type : '';
  const usage = rec.usage || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  const consumed = num(usage.tokens_consumed);
  const hasTokens = consumed !== null || input !== null || output !== null;

  let evidenceLevel;
  let tokensSource;

  switch (sourceType) {
    case 'vendor_session_store':
      evidenceLevel = 'vendor_session_store';
      tokensSource = 'vendor_session_store';
      break;
    // The recorder tags every imported organization usage/cost export with
    // source.type = "provider_export". The remaining aliases are defensive in
    // case the upstream tool ever distinguishes them.
    case 'provider_export':
    case 'organization_export':
    case 'openai_usage':
    case 'openai_costs':
    case 'anthropic_usage':
    case 'anthropic_costs':
    case 'provider_reconciled':
      evidenceLevel = 'provider_reconciled';
      tokensSource = 'provider_reconciled';
      break;
    case 'native_telemetry':
      evidenceLevel = 'native_telemetry';
      tokensSource = 'native_telemetry';
      break;
    case 'manual_attestation':
      evidenceLevel = 'manual_attestation';
      tokensSource = 'manual_attestation';
      break;
    case 'local_recorder':
      // The recorder machine-observes timing/host but does not itself measure
      // tokens; tokens are only present if an adapter attached them.
      evidenceLevel = hasTokens ? 'native_telemetry' : 'system_probe';
      tokensSource = hasTokens ? 'native_telemetry' : 'unavailable';
      break;
    default:
      evidenceLevel = 'unavailable';
      tokensSource = 'unavailable';
  }

  // Timing is machine-observed by the recorder for everything except a manual
  // record where the operator supplied started/finished.
  const timingSource = sourceType === 'manual_attestation' ? 'manual_attestation' : 'system_probe';
  const benchmarkEligible = TRUSTED_TOKEN_SOURCES.includes(tokensSource) && hasTokens;

  return {
    evidenceLevel,
    tokensSource,
    timingSource,
    benchmarkEligible,
    tokens: { input, output, consumed },
  };
}

function ledgerRecordToAttempt(rec) {
  const ev = deriveEvidence(rec);
  const usage = rec.usage || {};
  const host = rec.host || {};
  const billing = rec.billing || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // Back-compat build.tokens: the observed total, or input+output, else null.
  // Never invent a value — unavailable tokens stay null.
  let buildTokens = num(usage.tokens_consumed);
  if (buildTokens === null) {
    const i = num(usage.input_tokens);
    const o = num(usage.output_tokens);
    if (i !== null || o !== null) buildTokens = (i || 0) + (o || 0);
  }

  const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return {
    id: attemptId,
    timestamp: new Date().toISOString(),
    model: typeof rec.model === 'string' ? rec.model : '',
    environment: {
      tool: typeof host.client === 'string' && host.client ? host.client : '',
      toolBuild: '',
      os: typeof host.os === 'string' ? host.os : '',
      osBuild: typeof host.os_version === 'string' ? host.os_version : host.os_release || '',
    },
    build: {
      tokens: buildTokens,
      durationMs: num(rec.duration_ms),
    },
    // Observed usage, kept separate from billing (a token total is not a bill).
    usage: {
      inputTokens: num(usage.input_tokens),
      outputTokens: num(usage.output_tokens),
      cachedInputTokens: num(usage.cached_input_tokens),
      tokensConsumed: num(usage.tokens_consumed),
      billedTokens: num(usage.billed_tokens),
      unavailableReason:
        typeof usage.unavailable_reason === 'string' ? usage.unavailable_reason : null,
    },
    billing: {
      actualCostUsd: num(billing.actual_cost_usd),
      currency: typeof billing.currency === 'string' ? billing.currency : null,
      source: typeof billing.source === 'string' ? billing.source : 'unavailable',
      authoritative: billing.source === 'provider_cost_api',
    },
    evidence: {
      evidenceLevel: ev.evidenceLevel,
      tokensSource: ev.tokensSource,
      timingSource: ev.timingSource,
      provider: typeof rec.provider === 'string' ? rec.provider : null,
      recorder: RECORDER,
      recorderVersion: RECORDER_VERSION,
      ledgerRecordId: typeof rec.record_id === 'string' ? rec.record_id : null,
      ledgerRunId: typeof rec.run_id === 'string' ? rec.run_id : null,
      recordHash: typeof rec.record_hash === 'string' ? rec.record_hash : null,
      provenanceClient: typeof host.client === 'string' ? host.client : null,
    },
    benchmarkEligible: ev.benchmarkEligible,
    evaluation: {
      method: 'none',
      fidelityScore: null,
      passed: null,
      feedback: '',
      evaluatedAt: null,
    },
  };
}

function readLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) {
    fail(`ledger not found at ${ledgerPath}. Record evidence first with llm_usage_reader.py.`);
  }
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (e) {
      fail(`corrupt ledger line in ${ledgerPath}: ${e.message}`);
    }
  }
  if (records.length === 0) fail(`ledger ${ledgerPath} has no records`);
  return records;
}

function selectRecord(records, values) {
  if (values['record-id']) {
    const hit = records.filter((r) => r.record_id === values['record-id']).pop();
    if (!hit) fail(`no ledger record with record_id ${values['record-id']}`);
    return hit;
  }
  if (values['run-id']) {
    const hit = records.filter((r) => r.run_id === values['run-id']).pop();
    if (!hit) fail(`no ledger record with run_id ${values['run-id']}`);
    return hit;
  }
  // default / --latest: the most recently appended record
  return records[records.length - 1];
}

function main() {
  let values;
  try {
    values = parseArgs({
      options: {
        id: { type: 'string' },
        ledger: { type: 'string' },
        'record-id': { type: 'string' },
        'run-id': { type: 'string' },
        latest: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
    }).values;
  } catch (err) {
    fail(`parsing arguments: ${err.message}`);
  }

  if (values.help) {
    console.log(
      'Usage: node scripts/record-evidence.js --id <one-shot> [--latest | --record-id rec_x | --run-id run_x] [--ledger <path>]'
    );
    process.exit(0);
  }

  const id = values.id;
  if (!id || typeof id !== 'string') fail('--id <one-shot-name> is required.');
  if (!/^[a-z0-9-]+$/.test(id)) fail(`invalid ID "${id}". Must match kebab-case (/^[a-z0-9-]+$/).`);
  if (id.includes('..') || id.includes('/') || id.includes('\\') || /[;&|`$]/.test(id)) {
    fail('path traversal or invalid characters in ID.');
  }

  const repoRoot = path.resolve(__dirname, '..');
  const ledgerPath = values.ledger
    ? path.resolve(values.ledger)
    : path.join(repoRoot, 'tools', 'llm-usage-reader', 'data', 'usage-ledger.jsonl');

  const records = readLedger(ledgerPath);
  const record = selectRecord(records, values);
  const attempt = ledgerRecordToAttempt(record);

  const targetDir = path.join(repoRoot, 'one-shots', id);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    fail(`one-shot directory not found at ${targetDir}`);
  }
  const manifestPath = path.join(targetDir, 'oneshot.json');
  if (!fs.existsSync(manifestPath)) fail(`oneshot.json not found at ${manifestPath}`);

  // Acquire write lock (mkdir-based, mirrors record-attempt.js).
  const lockPath = path.join(targetDir, 'oneshot.json.lock');
  let hasLock = false;
  const cleanupLock = () => {
    if (hasLock) {
      try {
        fs.rmdirSync(lockPath);
      } catch (e) {
        /* ignore */
      }
      hasLock = false;
    }
  };
  process.on('exit', cleanupLock);

  for (let i = 0; i < 20; i++) {
    try {
      fs.mkdirSync(lockPath);
      hasLock = true;
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        const start = Date.now();
        while (Date.now() - start < 50) {
          /* busy-wait */
        }
      } else {
        fail(`failed to create lock directory: ${err.message}`);
      }
    }
  }
  if (!hasLock) fail(`could not acquire write lock on ${lockPath} after 20 attempts.`);

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    cleanupLock();
    fail(`failed to parse oneshot.json: ${err.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    cleanupLock();
    fail('oneshot.json must be a JSON object.');
  }
  if (!Array.isArray(manifest.attempts)) manifest.attempts = [];

  manifest.attempts.push(attempt);

  const tmpPath = path.join(targetDir, `oneshot.json.tmp.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    cleanupLock();
    fail(`writing temporary file: ${err.message}`);
  }

  let renamed = false;
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmpPath, manifestPath);
      renamed = true;
      break;
    } catch (e) {
      const start = Date.now();
      while (Date.now() - start < 50) {
        /* busy-wait */
      }
    }
  }
  if (!renamed) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      /* ignore */
    }
    cleanupLock();
    fail('failed to replace manifest file after 5 attempts.');
  }

  cleanupLock();

  console.log(
    JSON.stringify(
      {
        ok: true,
        id,
        attemptId: attempt.id,
        evidenceLevel: attempt.evidence.evidenceLevel,
        tokensSource: attempt.evidence.tokensSource,
        benchmarkEligible: attempt.benchmarkEligible,
        model: attempt.model,
        durationMs: attempt.build.durationMs,
        tokens: attempt.build.tokens,
        ledgerRecordId: attempt.evidence.ledgerRecordId,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main();
}

module.exports = { deriveEvidence, ledgerRecordToAttempt };
