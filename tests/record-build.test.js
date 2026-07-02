#!/usr/bin/env node
/**
 * Standalone regression test for scripts/record-build.js.
 * Run: node tests/record-build.test.js
 *
 * Uses a deterministic fixture transcript (known tokens / model / speed /
 * version / timestamps) so the aggregation can be checked against exact
 * expected numbers — the recorder must never invent or drift values.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const {
  aggregateTranscript,
  buildAttempt,
  parseCodexRollout,
} = require('../scripts/record-build.js');

const repoRoot = path.resolve(__dirname, '..');
const id = 'tmp-record-build-test';
const dir = path.join(repoRoot, 'one-shots', id);
const fixture = path.join(repoRoot, `tmp-build-fixture-${process.pid}.jsonl`);
const codexFixture = path.join(repoRoot, `tmp-codex-fixture-${process.pid}.jsonl`);

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
}

function assistant(ts, model, input, output, cacheRead, speed) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    version: '9.9.9-test',
    sessionId: 'sess-test',
    cwd: 'C:\\some\\where',
    message: {
      model,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: 0,
        speed,
      },
    },
  });
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function setup() {
  rm(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'oneshot.json'),
    JSON.stringify({ schemaVersion: 1, spec: null, attempts: [] }, null, 2)
  );
  // Two assistant messages 5s apart + user lines that exercise prompt counting:
  // one real human prompt (counted), one tool_result (ignored), one sidechain
  // user message (ignored), one command message (ignored).
  const lines = [
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-20T09:59:59.000Z',
      message: { role: 'user', content: 'Build the thing per the vision.' },
    }),
    assistant('2026-06-20T10:00:00.000Z', 'claude-opus-4-8', 100, 50, 10, 'standard'),
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-20T10:00:02.000Z',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' }],
      },
    }),
    JSON.stringify({
      type: 'user',
      isSidechain: true,
      timestamp: '2026-06-20T10:00:03.000Z',
      message: { role: 'user', content: 'subagent task prompt' },
    }),
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-20T10:00:04.000Z',
      message: { role: 'user', content: '<command-name>/goal</command-name>' },
    }),
    assistant('2026-06-20T10:00:05.000Z', 'claude-opus-4-8', 200, 80, 20, 'standard'),
  ];
  fs.writeFileSync(fixture, lines.join('\n') + '\n');
}

function cleanup() {
  rm(dir);
  rm(fixture);
  rm(codexFixture);
  // The CLI runs above regenerated LESSONS.md while the temp one-shot still
  // existed; regenerate once more so the artifact never keeps fixture rows.
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'generate-lessons.mjs')], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
}

// A Codex rollout reports a CUMULATIVE running token total (we must take the
// LAST, not sum), unlike Claude Code's per-message usage. This fixture proves
// the adapter handles that opposite accounting model correctly.
function writeCodexFixture() {
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      timestamp: '2026-06-20T10:00:00.000Z',
      payload: {
        id: 'sess-codex',
        cwd: 'C:\\work',
        cli_version: '0.142.0-alpha.1',
        model_provider: 'openai',
      },
    }),
    JSON.stringify({
      type: 'turn_context',
      timestamp: '2026-06-20T10:00:01.000Z',
      payload: { model: 'gpt-5.5' },
    }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-06-20T10:00:02.000Z' }),
    JSON.stringify({
      type: 'response_item',
      timestamp: '2026-06-20T10:00:02.500Z',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'build it' }],
      },
    }),
    // First cumulative snapshot — must be SUPERSEDED by the next one.
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-06-20T10:00:03.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 200,
            output_tokens: 300,
            total_tokens: 1300,
          },
        },
      },
    }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-06-20T10:00:08.000Z' }),
    // Final cumulative snapshot — this is the session total.
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-06-20T10:00:10.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 5000,
            cached_input_tokens: 1000,
            output_tokens: 800,
            total_tokens: 5800,
          },
        },
      },
    }),
  ];
  fs.writeFileSync(codexFixture, lines.join('\n') + '\n');
}

try {
  setup();

  // 1. Pure aggregation matches exact expected numbers.
  check('aggregateTranscript sums tokens, picks model/speed, spans time', () => {
    const agg = aggregateTranscript(fixture);
    assert.strictEqual(agg.model, 'claude-opus-4-8');
    assert.strictEqual(agg.speed, 'standard');
    assert.strictEqual(agg.version, '9.9.9-test');
    assert.strictEqual(agg.input, 300); // 100 + 200
    assert.strictEqual(agg.output, 130); // 50 + 80
    assert.strictEqual(agg.cacheRead, 30); // 10 + 20
    assert.strictEqual(agg.tokensConsumed, 430); // 300 + 130
    assert.strictEqual(agg.durationMs, 5000); // 10:00:05 - 10:00:00
    assert.strictEqual(agg.messages, 2); // user lines ignored
    assert.strictEqual(agg.provider, 'anthropic');
  });

  // 1b. Prompt counting: only real human prompts count — tool results,
  // sidechain (subagent) prompts, and injected command messages do not.
  check('aggregateTranscript counts only real human prompts', () => {
    const agg = aggregateTranscript(fixture);
    assert.strictEqual(agg.userPrompts, 1);
  });

  check('buildAttempt records interaction + strategy + observations', () => {
    const agg = aggregateTranscript(fixture);
    const attempt = buildAttempt(agg, {
      tool: 'claude-code',
      strategy: 'single-prompt',
      observations: { wentWell: ['w'], struggled: [], lessons: ['l'] },
    });
    assert.deepStrictEqual(attempt.interaction, {
      userPrompts: 1,
      oneShot: true,
      source: 'transcript',
    });
    assert.strictEqual(attempt.strategy, 'single-prompt');
    assert.deepStrictEqual(attempt.observations.lessons, ['l']);
    assert.ok(typeof attempt.observations.notedAt === 'string');
  });

  check('buildAttempt omits learning fields when absent', () => {
    const agg = aggregateTranscript(fixture);
    const attempt = buildAttempt({ ...agg, userPrompts: null }, { tool: 'claude-code' });
    assert.ok(!('interaction' in attempt));
    assert.ok(!('strategy' in attempt));
    assert.ok(!('observations' in attempt));
  });

  check('CLI --dry-run carries strategy and observation flags', () => {
    const out = execFileSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts', 'record-build.js'),
        '--id',
        id,
        '--transcript',
        fixture,
        '--dry-run',
        '--strategy',
        'single-prompt',
        '--went-well',
        'scaffolding',
        '--lesson',
        'lesson one',
        '--lesson',
        'lesson two',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.attempt.strategy, 'single-prompt');
    assert.deepStrictEqual(parsed.attempt.observations.wentWell, ['scaffolding']);
    assert.deepStrictEqual(parsed.attempt.observations.lessons, ['lesson one', 'lesson two']);
    assert.strictEqual(parsed.attempt.interaction.userPrompts, 1);
  });

  // 2. CLI writes a fully-populated, benchmark-eligible attempt.
  check('record-build.js writes one attempt with every captured field', () => {
    const out = JSON.parse(
      execFileSync(
        'node',
        ['scripts/record-build.js', '--id', id, '--transcript', fixture, '--effort', 'high'],
        { cwd: repoRoot, encoding: 'utf8' }
      )
    );
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.buildTokens, 430);
    assert.strictEqual(out.buildTimeMs, 5000);
    assert.strictEqual(out.benchmarkEligible, true);

    const m = JSON.parse(fs.readFileSync(path.join(dir, 'oneshot.json'), 'utf8'));
    assert.strictEqual(m.attempts.length, 1);
    const a = m.attempts[0];
    assert.strictEqual(a.model, 'claude-opus-4-8');
    assert.strictEqual(a.environment.tool, 'claude-code');
    assert.strictEqual(a.environment.toolBuild, '9.9.9-test');
    assert.strictEqual(a.environment.speed, 'standard');
    assert.strictEqual(a.environment.effort, 'high');
    assert.ok(a.environment.os && a.environment.osBuild); // real host, non-empty
    assert.strictEqual(a.build.tokens, 430);
    assert.strictEqual(a.build.durationMs, 5000);
    assert.strictEqual(a.usage.inputTokens, 300);
    assert.strictEqual(a.usage.outputTokens, 130);
    assert.strictEqual(a.usage.cachedInputTokens, 30);
    assert.strictEqual(a.evidence.evidenceLevel, 'vendor_session_store');
    assert.strictEqual(a.evidence.tokensSource, 'vendor_session_store');
    assert.strictEqual(a.evidence.recorder, 'record-build.js');
    assert.strictEqual(a.benchmarkEligible, true);
  });

  // 3. A transcript with no assistant usage fails loudly (never writes a bogus attempt).
  check('record-build.js rejects a transcript with no telemetry', () => {
    const empty = path.join(repoRoot, `tmp-empty-${process.pid}.jsonl`);
    fs.writeFileSync(empty, JSON.stringify({ type: 'user', message: {} }) + '\n');
    let threw = false;
    try {
      execFileSync('node', ['scripts/record-build.js', '--id', id, '--transcript', empty], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      threw = true;
    }
    rm(empty);
    assert.strictEqual(threw, true, 'expected non-zero exit on empty transcript');
    // still only the one attempt from test 2 — no bogus append
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'oneshot.json'), 'utf8'));
    assert.strictEqual(m.attempts.length, 1);
  });

  // 4. Codex adapter: takes the LAST cumulative total, and excludes cached input
  // so build tokens are accounted the same way as Claude Code (non-cached + out).
  check('parseCodexRollout takes the final total and excludes cached input', () => {
    writeCodexFixture();
    const agg = parseCodexRollout(codexFixture);
    assert.strictEqual(agg.model, 'gpt-5.5');
    assert.strictEqual(agg.provider, 'openai');
    assert.strictEqual(agg.version, '0.142.0-alpha.1');
    // final total (NOT 1300+5800); input 5000 INCLUDES 1000 cached -> non-cached 4000.
    assert.strictEqual(agg.input, 4000); // 5000 raw input - 1000 cached
    assert.strictEqual(agg.output, 800);
    assert.strictEqual(agg.cacheRead, 1000);
    assert.strictEqual(agg.tokensConsumed, 4800); // 4000 non-cached input + 800 output
    assert.strictEqual(agg.durationMs, 10000); // 10:00:10 - 10:00:00
  });

  check('parseCodexRollout counts user input messages', () => {
    const agg = parseCodexRollout(codexFixture);
    assert.strictEqual(agg.userPrompts, 1);
  });

  // 5. CLI --tool codex writes an attempt stamped with the codex tool.
  check('record-build.js --tool codex writes a codex-tagged attempt', () => {
    const out = JSON.parse(
      execFileSync(
        'node',
        ['scripts/record-build.js', '--id', id, '--tool', 'codex', '--transcript', codexFixture],
        { cwd: repoRoot, encoding: 'utf8' }
      )
    );
    assert.strictEqual(out.tool, 'codex 0.142.0-alpha.1');
    assert.strictEqual(out.buildTokens, 4800);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'oneshot.json'), 'utf8'));
    const a = m.attempts[m.attempts.length - 1];
    assert.strictEqual(a.environment.tool, 'codex');
    assert.strictEqual(a.environment.toolBuild, '0.142.0-alpha.1');
    assert.strictEqual(a.model, 'gpt-5.5');
    assert.strictEqual(a.evidence.provider, 'openai');
    assert.strictEqual(a.benchmarkEligible, true);
  });

  cleanup();
  console.log(`\nrecord-build.test.js: ALL ${passed} CHECKS PASSED`);
  process.exit(0);
} catch (err) {
  try {
    cleanup();
  } catch (e) {
    /* ignore */
  }
  console.error('\nrecord-build.test.js: FAILED');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}
