#!/usr/bin/env node

/**
 * record-build.js — one command that records a finished build to the dashboard.
 *
 * The workflow this serves: you pick a one-shot, open whatever coding tool you
 * like (Claude Code today), give it the prompt, and it builds. When it finishes
 * you run ONE command and the attempt shows up on the dashboard with everything
 * filled in automatically — no numbers typed by a human:
 *
 *   what model        <- the model the tool actually used
 *   the setting       <- effort / speed (e.g. "standard" / "fast")
 *   the tool + build  <- e.g. "claude-code 2.1.181"
 *   OS + build        <- e.g. "Windows 10.0.26200"
 *   build tokens      <- summed from the real session usage
 *   build time        <- wall-clock span of the build session
 *
 * It reads the coding tool's own session transcript (the source of truth — see
 * tools/llm-usage-reader/DESIGN-rationale.md: the agent never reports its own
 * telemetry) and aggregates that ONE build session into ONE evidence-backed
 * attempt appended to the one-shot's oneshot.json.
 *
 * Usage:
 *   node scripts/record-build.js --id <one-shot>                 # auto-find newest session for this project
 *   node scripts/record-build.js --id <one-shot> --transcript <file.jsonl>
 *   node scripts/record-build.js --id <one-shot> --projects-dir <dir>
 *   node scripts/record-build.js --id <one-shot> --effort high   # tag a setting the transcript doesn't carry
 *   node scripts/record-build.js --id <one-shot> --dry-run       # print the attempt, don't write
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseArgs } = require('util');

const RECORDER = 'record-build.js';
const RECORDER_VERSION = '0.1.0';

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Map a node platform id to the human OS name the rest of the system uses.
function osName() {
  const t = os.type();
  if (t === 'Windows_NT') return 'Windows';
  if (t === 'Darwin') return 'macOS';
  return t || process.platform;
}

// The Claude Code projects dir encodes the project path with every non-alnum
// char replaced by '-'. Derive it from the current working directory so the
// common case ("just record my last build") needs no flags.
function defaultProjectsDir() {
  const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', slug);
}

function newestTranscript(projectsDir) {
  if (!fs.existsSync(projectsDir)) {
    fail(
      `no Claude Code transcripts found at ${projectsDir}. ` +
        `Pass --transcript <file.jsonl> explicitly.`
    );
  }
  const jsonl = fs
    .readdirSync(projectsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(projectsDir, f))
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (jsonl.length === 0) fail(`no .jsonl transcript files in ${projectsDir}.`);
  return jsonl[0].p;
}

// Aggregate one transcript (one build session) into the fields the dashboard
// shows. Returns null if the transcript carries no usable assistant telemetry.
function aggregateTranscript(transcriptPath) {
  const raw = fs.readFileSync(transcriptPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());

  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let messages = 0;
  let minTs = null;
  let maxTs = null;
  let version = '';
  let sessionId = '';
  let cwd = '';
  const modelCounts = new Map();
  const speedCounts = new Map();

  const bump = (map, key) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  };
  const topKey = (map) => {
    let best = null;
    let bestN = -1;
    for (const [k, n] of map) {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    }
    return best;
  };

  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (o.version && !version) version = String(o.version);
    if (o.sessionId && !sessionId) sessionId = String(o.sessionId);
    if (o.cwd && !cwd) cwd = String(o.cwd);

    const msg = o.message;
    const usage = msg && msg.usage;
    const isAssistant = o.type === 'assistant' && msg && usage;
    if (!isAssistant) continue;

    messages += 1;
    input += num(usage.input_tokens);
    output += num(usage.output_tokens);
    cacheRead += num(usage.cache_read_input_tokens);
    bump(modelCounts, msg.model);
    bump(speedCounts, usage.speed);

    if (o.timestamp) {
      const t = Date.parse(o.timestamp);
      if (Number.isFinite(t)) {
        if (minTs === null || t < minTs) minTs = t;
        if (maxTs === null || t > maxTs) maxTs = t;
      }
    }
  }

  if (messages === 0) return null;

  const model = topKey(modelCounts) || '';
  const speed = topKey(speedCounts) || null;
  const tokensConsumed = input + output;
  const durationMs = minTs !== null && maxTs !== null ? maxTs - minTs : null;

  let provider = 'unknown';
  const m = model.toLowerCase();
  if (m.startsWith('claude') || m.includes('opus') || m.includes('sonnet') || m.includes('haiku')) {
    provider = 'anthropic';
  } else if (
    m.startsWith('gpt') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4')
  ) {
    provider = 'openai';
  } else if (m.startsWith('gemini')) {
    provider = 'google';
  }

  return {
    model,
    speed,
    provider,
    version,
    sessionId,
    cwd,
    messages,
    input,
    output,
    cacheRead,
    tokensConsumed,
    durationMs,
  };
}

function buildAttempt(agg, opts) {
  const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return {
    id: attemptId,
    timestamp: new Date().toISOString(),
    model: agg.model,
    environment: {
      tool: opts.tool || 'claude-code',
      toolBuild: agg.version || '',
      os: osName(),
      osBuild: os.release(),
      // The "setting" the operator asked to see: speed comes straight from the
      // session usage; effort isn't in the transcript, so it's an optional tag.
      speed: agg.speed || null,
      effort: opts.effort || null,
    },
    build: {
      tokens: agg.tokensConsumed > 0 ? agg.tokensConsumed : null,
      durationMs: agg.durationMs,
    },
    usage: {
      inputTokens: agg.input,
      outputTokens: agg.output,
      cachedInputTokens: agg.cacheRead || null,
      tokensConsumed: agg.tokensConsumed,
      billedTokens: null,
      unavailableReason: null,
    },
    billing: {
      actualCostUsd: null,
      currency: null,
      source: 'unavailable',
      authoritative: false,
    },
    evidence: {
      evidenceLevel: 'vendor_session_store',
      tokensSource: 'vendor_session_store',
      timingSource: 'system_probe',
      provider: agg.provider,
      recorder: RECORDER,
      recorderVersion: RECORDER_VERSION,
      sessionId: agg.sessionId || null,
      transcriptMessages: agg.messages,
      provenanceClient: opts.tool || 'claude-code',
    },
    benchmarkEligible: agg.tokensConsumed > 0,
    evaluation: {
      method: 'none',
      fidelityScore: null,
      passed: null,
      feedback: '',
      evaluatedAt: null,
    },
  };
}

function appendAttempt(targetDir, manifestPath, attempt) {
  const lockPath = path.join(targetDir, 'oneshot.json.lock');
  let hasLock = false;
  const cleanup = () => {
    if (hasLock) {
      try {
        fs.rmdirSync(lockPath);
      } catch (e) {
        /* ignore */
      }
      hasLock = false;
    }
  };
  process.on('exit', cleanup);

  for (let i = 0; i < 20; i++) {
    try {
      fs.mkdirSync(lockPath);
      hasLock = true;
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        const start = Date.now();
        while (Date.now() - start < 50) {}
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
    cleanup();
    fail(`failed to parse oneshot.json: ${err.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    cleanup();
    fail('oneshot.json must be a JSON object.');
  }
  if (!Array.isArray(manifest.attempts)) manifest.attempts = [];
  manifest.attempts.push(attempt);

  const tmpPath = path.join(targetDir, `oneshot.json.tmp.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    cleanup();
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
      while (Date.now() - start < 50) {}
    }
  }
  if (!renamed) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      /* ignore */
    }
    cleanup();
    fail('failed to replace manifest file after 5 attempts.');
  }
  cleanup();
}

// ---------------------------------------------------------------------------
// Adapters. Every coding tool persists its session telemetry differently — even
// the token accounting differs (Claude Code reports per-message usage we SUM;
// Codex reports a CUMULATIVE running total we take the LAST of) — so a single
// universal parser cannot work. What DOES generalize is the interface: an
// adapter knows (a) where that tool's newest session lives and (b) how to read
// it into the common aggregate shape buildAttempt() consumes. Adding a tool =
// adding one entry to ADAPTERS; nothing else changes.
//   aggregate = { model, speed, provider, version, sessionId, cwd, messages,
//                 input, output, cacheRead, tokensConsumed, durationMs }
// ---------------------------------------------------------------------------

function inferProvider(model) {
  const m = (model || '').toLowerCase();
  if (m.startsWith('claude') || m.includes('opus') || m.includes('sonnet') || m.includes('haiku'))
    return 'anthropic';
  if (
    m.startsWith('gpt') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.startsWith('codex')
  )
    return 'openai';
  if (m.startsWith('gemini')) return 'google';
  return 'unknown';
}

function readJsonl(p) {
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

function walkFiles(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(f, acc);
    else acc.push(f);
  }
  return acc;
}

// --- Codex CLI (OpenAI) ---
// ~/.codex/{sessions,archived_sessions}/**/rollout-<ISO>-<uuid>.jsonl :
// session_meta (cli_version, cwd, model_provider) + turn_context (model) +
// event_msg "token_count" events whose info.total_token_usage is CUMULATIVE.
function defaultCodexDirs() {
  const base = path.join(os.homedir(), '.codex');
  return [path.join(base, 'sessions'), path.join(base, 'archived_sessions')];
}

function newestCodexRollout(dirs) {
  let best = null;
  for (const d of dirs) {
    for (const f of walkFiles(d)) {
      if (!/rollout-.*\.jsonl$/i.test(f)) continue;
      let m;
      try {
        m = fs.statSync(f).mtimeMs;
      } catch (e) {
        continue;
      }
      if (!best || m > best.m) best = { f, m };
    }
  }
  return best ? best.f : null;
}

function parseCodexRollout(p) {
  const recs = readJsonl(p);
  if (!recs.length) return null;
  const metaRec = recs.find((r) => r.type === 'session_meta');
  const meta = metaRec ? metaRec.payload || metaRec : {};

  // Model: turn_context carries the active model; fall back to any model field.
  let model = '';
  const tc = recs.filter((r) => r.type === 'turn_context').pop();
  if (tc) model = (tc.payload && tc.payload.model) || tc.model || '';
  if (!model) {
    for (const r of recs) {
      const mm = JSON.stringify(r).match(/"model"\s*:\s*"([a-zA-Z0-9._-]+)"/);
      if (mm) {
        model = mm[1];
        break;
      }
    }
  }

  // Tokens: the LAST token_count event's total_token_usage is the running total.
  let tot = null;
  for (const r of recs) {
    if (
      r.type === 'event_msg' &&
      r.payload &&
      r.payload.type === 'token_count' &&
      r.payload.info &&
      r.payload.info.total_token_usage
    ) {
      tot = r.payload.info.total_token_usage;
    }
  }
  // Codex's input_tokens INCLUDES the cached portion, whereas Claude Code's
  // input_tokens already excludes cache. To keep "build tokens" comparable
  // across tools, subtract the cache so tokensConsumed is non-cached input +
  // output for BOTH adapters (cached is tracked separately, not double-counted).
  const rawInput = tot ? num(tot.input_tokens) : 0;
  const output = tot ? num(tot.output_tokens) : 0;
  const cached = tot ? num(tot.cached_input_tokens) : 0;
  const input = Math.max(0, rawInput - cached);
  const tokensConsumed = input + output;

  const tsList = recs
    .map((r) => r.timestamp)
    .filter(Boolean)
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n));
  const durationMs = tsList.length ? Math.max(...tsList) - Math.min(...tsList) : null;

  if (!model && rawInput === 0 && output === 0) return null;

  return {
    model,
    speed: null, // Codex rollouts don't record a speed/effort tier.
    provider: meta.model_provider || inferProvider(model),
    version: meta.cli_version || '',
    sessionId: meta.id || '',
    cwd: meta.cwd || '',
    messages: recs.filter((r) => r.type === 'response_item').length,
    input,
    output,
    cacheRead: cached,
    tokensConsumed,
    durationMs,
  };
}

const ADAPTERS = {
  'claude-code': {
    label: 'claude-code',
    locate: (opts) =>
      newestTranscript(opts.projectsDir ? path.resolve(opts.projectsDir) : defaultProjectsDir()),
    parse: aggregateTranscript,
  },
  codex: {
    label: 'codex',
    locate: (opts) =>
      newestCodexRollout(opts.projectsDir ? [path.resolve(opts.projectsDir)] : defaultCodexDirs()),
    parse: parseCodexRollout,
  },
};

function main() {
  let values;
  try {
    values = parseArgs({
      options: {
        id: { type: 'string' },
        tool: { type: 'string' },
        transcript: { type: 'string' },
        'projects-dir': { type: 'string' },
        effort: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'list-tools': { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
    }).values;
  } catch (err) {
    fail(`parsing arguments: ${err.message}`);
  }

  if (values['list-tools']) {
    console.log(`Supported tools: ${Object.keys(ADAPTERS).join(', ')}`);
    process.exit(0);
  }

  if (values.help) {
    console.log(
      'Usage: node scripts/record-build.js --id <one-shot> [--tool <claude-code|codex>] ' +
        '[--transcript <file.jsonl>] [--projects-dir <dir>] [--effort <val>] [--dry-run] [--list-tools]'
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
  const targetDir = path.join(repoRoot, 'one-shots', id);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    fail(`one-shot directory not found at ${targetDir}`);
  }
  const manifestPath = path.join(targetDir, 'oneshot.json');
  if (!fs.existsSync(manifestPath)) fail(`oneshot.json not found at ${manifestPath}`);

  const toolName = values.tool || 'claude-code';
  const adapter = ADAPTERS[toolName];
  if (!adapter) {
    fail(`unknown --tool "${toolName}". Known tools: ${Object.keys(ADAPTERS).join(', ')}.`);
  }

  const transcriptPath = values.transcript
    ? path.resolve(values.transcript)
    : adapter.locate({ projectsDir: values['projects-dir'] });
  if (!transcriptPath) {
    fail(`no ${toolName} session transcript found. Pass --transcript <file> explicitly.`);
  }
  if (!fs.existsSync(transcriptPath)) fail(`transcript not found at ${transcriptPath}`);

  const agg = adapter.parse(transcriptPath);
  if (!agg) fail(`no usable build telemetry found in ${transcriptPath}.`);

  const attempt = buildAttempt(agg, { effort: values.effort, tool: adapter.label });

  const summary = {
    ok: true,
    id,
    attemptId: attempt.id,
    transcript: transcriptPath,
    model: attempt.model,
    setting: { speed: attempt.environment.speed, effort: attempt.environment.effort },
    tool: `${attempt.environment.tool} ${attempt.environment.toolBuild}`.trim(),
    os: `${attempt.environment.os} ${attempt.environment.osBuild}`.trim(),
    buildTokens: attempt.build.tokens,
    buildTimeMs: attempt.build.durationMs,
    benchmarkEligible: attempt.benchmarkEligible,
    fromMessages: agg.messages,
  };

  if (values['dry-run']) {
    console.log(JSON.stringify({ ...summary, dryRun: true, attempt }, null, 2));
    return;
  }

  appendAttempt(targetDir, manifestPath, attempt);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { aggregateTranscript, buildAttempt, parseCodexRollout, ADAPTERS };
