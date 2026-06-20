# json-repair

Repairs **JSONC** — `//` line comments, `/* */` block comments, and trailing
commas — into strict, valid JSON. String-aware: comment markers and commas that
appear *inside* string literals are preserved. Dependency-free.

## Why this is a good example one-shot

Repairing malformed JSON is a classic "can a model one-shot this correctly?"
task. The interesting part is the edge cases — comment markers inside strings,
escaped quotes, commas inside strings — which is exactly where a quick attempt
goes wrong. Because the contract is a program (`verify.js`), a model's attempt is
scored objectively, which makes this a sharp **benchmark** and a good way to
**playtest** how carefully a model handles string-state.

Scope is intentionally narrow: it does **not** guess at single-quoted strings or
unquoted keys, and it throws rather than return a partial guess for input that is
broken beyond JSONC.

## Quick start

```bash
cd one-shots/json-repair
echo '{"a":1, /* note */ "b":[2,3,],}' | node index.js
# -> { "a": 1, "b": [2, 3] }

npm run verify   # acceptance test: exits 0 on pass, 1 on fail
```

## API

- `cleanJsonc(text) -> string` — comment/trailing-comma removal, string-aware.
- `repairJson(text) -> value` — cleaned then `JSON.parse`d (throws if still invalid).
- `repairJsonToString(text) -> string` — normalized pretty JSON.

## Acceptance

`acceptance.mode = "program"`, `script = "verify"`. Attempt telemetry is recorded
only via the evidence pipeline (`scripts/record-evidence.js`), never self-reported.
