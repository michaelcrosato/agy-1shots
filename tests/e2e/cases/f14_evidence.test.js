const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// F14: Evidence-backed attempts.
//
// Verifies the data-collection integration end to end: the evidence bridge
// (scripts/record-evidence.js) turns llm-usage-reader ledger records into
// attempts carrying full provenance, and the REAL manifest API classifies and
// surfaces evidence level + benchmark eligibility (legacy self-reported attempts
// are excluded; trusted vendor/provider token evidence is included).
describe('F14: Evidence-backed attempts', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const repoRoot = path.resolve(__dirname, '../../../');
  const id = 'temp-evidence-f14';
  const dir = path.join(repoRoot, 'one-shots', id);
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  const bridge = path.join(repoRoot, 'scripts', 'record-evidence.js');
  const VENDOR_HASH = 'deadbeef'.repeat(8);

  function rm(p) {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  }

  function bridgeRun(args) {
    return JSON.parse(
      execFileSync('node', [bridge, '--id', id, '--ledger', ledgerPath, ...args], {
        encoding: 'utf8',
      })
    );
  }

  beforeAll(() => {
    rm(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: id,
          version: '1.0.0',
          description: 'evidence test',
          scripts: { verify: 'node -e ""' },
        },
        null,
        2
      )
    );
    // Manifest seeded with ONE legacy attempt (no evidence block).
    const manifest = {
      schemaVersion: 1,
      spec: {
        vision: 'evidence test',
        createdAt: '2026-06-19T00:00:00Z',
        acceptance: { mode: 'program', script: 'verify', successExitCode: 0 },
      },
      attempts: [
        {
          id: 'att_legacy',
          timestamp: '2026-06-19T00:00:00Z',
          model: 'Legacy Model',
          environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
          build: { tokens: 999999, durationMs: 1000 },
          evaluation: {
            method: 'none',
            fidelityScore: null,
            passed: null,
            feedback: '',
            evaluatedAt: null,
          },
        },
      ],
    };
    fs.writeFileSync(path.join(dir, 'oneshot.json'), JSON.stringify(manifest, null, 2));
    // Ledger: a trusted vendor_session_store record + an untrusted manual record.
    const recVendor = {
      schema_version: 1,
      record_id: 'rec_vendor_f14',
      run_id: 'run_f14',
      kind: 'run',
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      started_at: '2026-06-19T10:00:00Z',
      finished_at: '2026-06-19T10:02:00Z',
      duration_ms: 120000,
      exit_code: 0,
      usage: {
        input_tokens: 50000,
        output_tokens: 8000,
        cached_input_tokens: 1000,
        tokens_consumed: 58000,
        billed_tokens: null,
        unavailable_reason: null,
      },
      billing: { actual_cost_usd: null, currency: null, source: 'unavailable' },
      host: { client: 'claude-code', os: 'Windows', os_version: '10.0.26200' },
      source: { type: 'vendor_session_store', adapter: 'claude-code' },
      record_hash: VENDOR_HASH,
    };
    const recManual = {
      schema_version: 1,
      record_id: 'rec_manual_f14',
      run_id: null,
      kind: 'run',
      status: 'completed',
      provider: 'openai',
      model: 'gpt-x',
      started_at: '2026-06-19T11:00:00Z',
      finished_at: '2026-06-19T11:01:00Z',
      duration_ms: 60000,
      usage: { input_tokens: 100, output_tokens: 20, tokens_consumed: 120 },
      billing: { actual_cost_usd: null, source: 'unavailable' },
      host: { client: null, os: 'Windows', os_version: '10.0.26200' },
      source: { type: 'manual_attestation' },
      record_hash: 'beadfeed'.repeat(8),
    };
    // A provider organization export bucket (the recorder tags these
    // source.type = "provider_export"); trusted token evidence.
    const recProvider = {
      schema_version: 1,
      record_id: 'rec_provider_f14',
      run_id: null,
      kind: 'provider_usage_bucket',
      status: 'completed',
      provider: 'openai',
      model: 'gpt-5.4',
      started_at: '2026-06-18T00:00:00Z',
      finished_at: '2026-06-19T00:00:00Z',
      duration_ms: 86400000,
      usage: { input_tokens: 1200, output_tokens: 300, tokens_consumed: 1500 },
      billing: { actual_cost_usd: 0.05, currency: 'USD', source: 'provider_cost_api' },
      host: { client: null, os: 'Windows', os_version: '10.0.26200' },
      source: { type: 'provider_export' },
      record_hash: 'cafef00d'.repeat(8),
    };
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify(recVendor) +
        '\n' +
        JSON.stringify(recManual) +
        '\n' +
        JSON.stringify(recProvider) +
        '\n'
    );
  });

  afterAll(() => {
    rm(dir);
  });

  test('F14_1: bridge records a benchmark-eligible vendor_session_store attempt', () => {
    const res = bridgeRun(['--record-id', 'rec_vendor_f14']);
    expect(res.ok).toBe(true);
    expect(res.evidenceLevel).toBe('vendor_session_store');
    expect(res.tokensSource).toBe('vendor_session_store');
    expect(res.benchmarkEligible).toBe(true);
    expect(res.durationMs).toBe(120000);
  });

  test('F14_2: stored attempt carries full provenance tied to the ledger record hash', () => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'oneshot.json'), 'utf8'));
    const a = m.attempts.find((x) => x.evidence && x.evidence.ledgerRecordId === 'rec_vendor_f14');
    expect(a).toExist();
    expect(a.evidence.recordHash).toBe(VENDOR_HASH);
    expect(a.evidence.recorder).toBe('llm-usage-reader');
    expect(a.usage.tokensConsumed).toBe(58000);
    expect(a.usage.cachedInputTokens).toBe(1000);
    expect(a.build.durationMs).toBe(120000);
    expect(a.benchmarkEligible).toBe(true);
  });

  test('F14_3: manual_attestation record is recorded but NOT benchmark-eligible', () => {
    const res = bridgeRun(['--record-id', 'rec_manual_f14']);
    expect(res.evidenceLevel).toBe('manual_attestation');
    expect(res.benchmarkEligible).toBe(false);
  });

  test('F14_5: provider_export records are provider_reconciled and benchmark-eligible', () => {
    const res = bridgeRun(['--record-id', 'rec_provider_f14']);
    expect(res.evidenceLevel).toBe('provider_reconciled');
    expect(res.tokensSource).toBe('provider_reconciled');
    expect(res.benchmarkEligible).toBe(true);
  });

  test('F14_4: manifest API classifies legacy attempts and surfaces eligibility', async () => {
    const r = await fetch(`${DASHBOARD_URL}/api/scan/${id}/manifest`);
    expect(r.status).toBe(200);
    const data = await r.json();

    const legacy = data.attempts.find((a) => a.id === 'att_legacy');
    expect(legacy).toExist();
    expect(legacy.evidenceLevel).toBe('legacy_self_reported');
    expect(legacy.benchmarkEligible).toBe(false);

    const vendor = data.attempts.find(
      (a) => a.evidence && a.evidence.ledgerRecordId === 'rec_vendor_f14'
    );
    expect(vendor).toExist();
    expect(vendor.evidenceLevel).toBe('vendor_session_store');
    expect(vendor.benchmarkEligible).toBe(true);

    // legacy(no) + vendor(yes) + manual(no) + provider(yes) => two eligible
    expect(data.benchmarkEligibleCount).toBe(2);
    expect(typeof data.latestEvidenceLevel).toBe('string');
  });
});
