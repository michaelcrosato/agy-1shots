# token-cost-estimator

A tiny, dependency-free utility that estimates the **token count** of a text and
its **blended USD cost** for a given model. Self-contained (its own pricing
snapshot), deterministic, and program-verifiable.

## Why this is a good example one-shot

It is small enough that any model can produce it in a single shot, yet it has an
objective, machine-checkable contract (`verify.js`). That makes it ideal for
**playtesting models** ("can this model one-shot a correct, edge-case-safe
utility?") and for **accurate benchmarking** — the acceptance test is a program,
not a human opinion, so a pass/fail is unambiguous.

## Quick start

```bash
cd one-shots/token-cost-estimator
node index.js gpt-4o-mini "Estimate the cost of this sentence."
# -> { model, chars, estimatedTokens, estimatedCostUsd, known }

npm run verify   # acceptance test: exits 0 on pass, 1 on fail
```

## API

- `estimateTokens(text) -> number` — ~4 chars/token heuristic; total and deterministic.
- `estimateCostUsd(model, tokens, {inputRatio=0.8}) -> number|null` — 80/20
  input/output blend; `null` for an unknown model (never a guess).
- `knownModels() -> string[]`.

## Acceptance

`acceptance.mode = "program"`, `script = "verify"`. The dashboard runs
`node verify.js` via `POST /api/manifest/verify` and records the objective
pass/fail. Attempt telemetry (tokens/timing/cost) is recorded **only** via the
evidence pipeline (`scripts/record-evidence.js` ← llm-usage-reader ledger), never
self-reported.
