# llm-usage-reader (vendored)

This directory is a vendored copy of **tool-llm-info-reader**
(`llm_usage_reader.py`), a dependency-free Python 3.10+ CLI that records and
summarizes **evidence-backed** LLM token-usage and cost data. Upstream:
<https://github.com/michaelcrosato/tool-llm-info-reader> (MIT, see `LICENSE`).

## Why it lives in OneShotForge

OneShotForge benchmarks one-shots across models. A benchmark is only as good as
its measurements, and the design review captured in [`DESIGN-rationale.md`](DESIGN-rationale.md)
(a 7-model council synthesis of *this* repo) reached one unanimous conclusion:

> **The LLM must never be the source of benchmark telemetry.**

Self-reported model names, token counts, timing, and environment data are
unreliable or fabricated. Timing and host facts must be machine-observed; token
and cost data must come from structured artifacts (provider usage/cost APIs or
local session transcripts); manual values must be labeled `manual_attestation`
and kept out of trusted comparisons.

This tool is that external recorder. OneShotForge uses it as the **source of
truth** for attempt telemetry instead of values an agent types into a manifest.

## How OneShotForge uses it

1. **Capture objective evidence** with the tool (writes an append-only,
   hash-verified ledger under `data/usage-ledger.jsonl`):
   - `wrap` — machine-observed start/finish/duration + host/client for a real run.
   - `import-claude-code` — real per-message token usage from Claude Code transcripts.
   - `import-openai-*` / `import-anthropic-*` / `fetch-*` — real provider usage/cost.
   - `record` — manual values, explicitly marked `manual_attestation`.
2. **Finalize into a one-shot manifest** with the repo bridge
   [`scripts/record-evidence.js`](../../scripts/record-evidence.js), which reads a
   ledger record and appends an evidence-backed attempt to `oneshot.json` with a
   provenance `evidence` block (`evidenceLevel`, `tokensSource`, `benchmarkEligible`)
   and observed-usage kept separate from billing.

The legacy `scripts/record-attempt.js` self-report path still works, but the
attempts it writes are stamped `manual_attestation` / `benchmarkEligible:false`.

## Running

```bash
python tools/llm-usage-reader/llm_usage_reader.py --help
python -m pytest tools/llm-usage-reader/tests/ -q   # 275 tests
```

Vendored, not modified. To pull upstream changes, re-copy `llm_usage_reader.py`,
`tests/`, `samples/`, `pyproject.toml`, `LICENSE`, and `README.md`.
