# OneShotForge Learning Layer — Design

Date: 2026-07-01
Status: Approved for implementation (autonomous session; requirements derived from the
owner's stated goal, quoted below)

## Goal (owner's words)

> "The goal is simple: create one-shot projects (whether they take 15 minutes, 2 hours,
> or a day), log the measurables to disk, and track the variables. It is also a teaching
> tool for people new to AI coding. It shows them: 'This is what happens when you do
> this,' or, 'If you give the AI this task, it can do X, but it struggles with Y using
> this specific model.'"

## Diagnosis

The repo already does the first half well: one-shot contract, immutable vision,
append-only attempts, evidence-graded telemetry (tokens/time/model/tool/OS) recorded to
disk by machine observation, tests and CI to keep it honest.

What is missing is the second half — the **teaching layer**:

1. Nothing captures the qualitative outcome of an attempt ("nailed the physics loop,
   struggled with shader syntax") in a structured, aggregatable way.
2. Nothing answers "was it _actually_ one-shot?" — the number of human prompts in the
   build session is machine-observable from the transcript but is not recorded.
3. Nothing aggregates across one-shots: there is no per-model profile, no
   model × one-shot scoreboard, no lessons feed.
4. Nothing teaches a newcomer: the dashboard assumes benchmark vocabulary, and the repo
   teaches nothing unless you run the dashboard.

## Approaches considered

- **A. Full rebuild.** Rejected. The measurement core is verified, tested, and exactly
  matches the goal. A rebuild discards working evidence infrastructure for no benefit.
- **B. Minimal additive** (observations fields + a lessons file). Rejected. Leaves the
  teaching story buried in a modal; no newcomer path.
- **C. Learning-layer reshape (chosen).** Keep the measurement core untouched. Add the
  missing half end-to-end: capture → aggregate → teach. Small targeted improvements
  where existing code shape hurts the work (new UI goes in new component files, not
  into the 2,000-line `DashboardClient.jsx`).

## Design

### 1. Schema additions (additive, invariants preserved)

`oneshot.json` attempts gain three optional blocks. `schemaVersion` stays `1` — all
fields are optional and old records remain valid and untouched (consistent with the
existing "classify at read time, never mutate" policy).

```json
{
  "id": "att_...",
  "strategy": "single-prompt",
  "interaction": { "userPrompts": 1, "oneShot": true, "source": "transcript" },
  "observations": {
    "wentWell": ["Deterministic physics loop worked first try"],
    "struggled": ["Custom GLSL shaders needed 3 corrections"],
    "lessons": ["This model one-shots WebGL scaffolding but not shader math"],
    "notedAt": "2026-07-01T00:00:00.000Z"
  }
}
```

- **`strategy`** (string ≤ 200 chars): the prompting variable being tracked —
  e.g. `single-prompt`, `plan-first`, `tdd`, `spec-paste`. Free-form by design.
- **`interaction`** — machine-observed from the session transcript by
  `record-build.js` (count of human prompt messages; `oneShot = userPrompts <= 1`).
  Consistent with the telemetry philosophy: the human never types this, the model
  never reports it. `source: "transcript"`. Absent on manual attempts.
- **`observations`** — the qualitative teaching record, entered by the human evaluator.
  **Write-once per attempt**: may be added to an attempt that has none; never edited or
  removed once present. This extends R4's append-only spirit: telemetry stays immutable,
  and the one allowed amendment is adding a missing qualitative note.

Validation lives in `dashboard/lib/manifest.js` (`validateObservationsInput`,
`validateStrategy`, `validateInteraction`), with prototype-pollution guards and length
caps matching existing style. Arrays capped at 20 items × 500 chars each.

### 2. Capture paths

- **`scripts/record-build.js`**: counts user prompts from the transcript it already
  parses → writes `interaction`. New flags: `--strategy <s>`, `--went-well <t>`
  (repeatable), `--struggled <t>` (repeatable), `--lesson <t>` (repeatable).
- **`POST /api/manifest/observations`** `{ id, attemptId, wentWell?, struggled?, lessons? }`:
  adds observations to an existing attempt. 404 unknown attempt, 409 if observations
  already present, 400 on invalid input. Mirrors the evaluation route's shape.
- **Dashboard**: the attempt row's expandable panel gains an "Observations" form
  (three textareas, one line per entry) shown when the attempt has none, and a
  read-only rendering when it does.

### 3. Insights engine

New `dashboard/lib/insights.js` — pure functions over scanned manifests:

- `buildInsights(pieces)` returns:
  - `models[]` — per-model profile: attempts, one-shot rate (numerator: attempts with
    `interaction.oneShot === true`; denominator: attempts that carry `interaction` at
    all — attempts without interaction data are excluded from the rate, not counted
    as failures), evaluated count, avg fidelity, verify pass rate, avg tokens /
    duration / cost
    (**benchmark-eligible attempts only** for token/cost/time aggregates — quantitative
    comparisons never mix trusted and untrusted telemetry; counts of excluded attempts
    are reported), top struggles (most recent `struggled` entries).
  - `matrix` — one-shot × model scoreboard cell: best outcome per (one-shot, model):
    verify passed / fidelity score / needed-N-prompts / no data.
  - `lessons[]` — flat feed of `lessons` entries attributed to (one-shot, model, date),
    newest first.
  - `totals` — one-shots, attempts, models seen, benchmark-eligible count.
- Grouping key is the exact `model` string (trimmed); no fuzzy normalization (v1).
- `GET /api/insights` serves it (reuses the scan logic's manifest reads).

### 4. Teaching surfaces

- **Insights tab** in the dashboard (third tab). New file
  `dashboard/app/components/InsightsTab.jsx` (targeted improvement: do not grow the
  monolith). Sections: plain-language intro, model scoreboard table, model × one-shot
  matrix, lessons feed. Terms get inline tooltip explanations from a small shared
  `GLOSSARY` map (token, one-shot, fidelity, evidence, benchmark-eligible).
- **`LESSONS.md` at repo root**, generated by `node scripts/generate-lessons.mjs`
  (ESM so it can import the dashboard's ESM libs directly; same generated-file pattern
  as the ideas README; added to `.prettierignore`). The markdown rendering lives in
  `dashboard/lib/lessons-md.js` (`renderLessonsMarkdown(insights)`) so the script, the
  API routes, and unit tests share one implementation. Structure: what this is
  (newcomer intro) → scoreboard → per-model profiles → lessons feed → glossary. Honest
  empty states ("No evaluated attempts yet — here's how to record one") when data is
  sparse. Regenerated after every manifest write that changes teaching data — the
  attempt, evaluation, verify, and observations API routes (same auto-regenerate
  pattern the ideas registry uses) — and by `record-build.js`, which invokes the
  generator script as a child process after appending an attempt. Regeneration failure
  is logged but never fails the write that triggered it.
- **README reframe**: mission stated as the two goals (measure + teach), a
  "Run your own experiment" walkthrough (pick idea → promote → prompt your tool →
  `record-build` → evaluate → observations → read LESSONS.md), link to LESSONS.md.
- **AGENTS.md**: builder prompt gains the observations step; rule R1 (system-prompt
  secrecy theater) is removed — it protects nothing in a public repo and conflicts
  with the teaching mission.

### 5. Testing

- Unit: `dashboard/lib/insights.test.mjs` (aggregation: eligibility filtering, one-shot
  rate, matrix outcomes, empty states); manifest tests extended for the three new
  validators + observations write-once conflict.
- `tests/record-build.test.js` extended: prompt counting from a fixture transcript,
  observation flags.
- E2E: new `tests/e2e/cases/f15_insights.test.js` — POST observations (success, 409 on
  second write, 400 invalid), GET /api/insights shape, LESSONS.md regeneration.
- All existing gates stay green: `node tests/run-unit.js`, `node tests/e2e/verify.js`,
  prettier/eslint, dashboard build.

### Error handling

- Observations on unknown attempt → 404; duplicate → 409; oversized/invalid → 400
  (ManifestError pattern; no internal detail leaks — matches PR #21's policy).
- Insights over zero/partial data → structured empty states, never NaN (guard all
  divisions).
- `generate-lessons.js` on unreadable manifest → skips the one-shot, notes the skip in
  output, exits 0 (a broken manifest must not block teaching output for the rest).

### Out of scope (YAGNI)

- Fuzzy model-name normalization; LLM-generated lesson synthesis; multi-user anything;
  DB storage; rewriting DashboardClient.jsx beyond adding the tab hook-in; renaming the
  repo/project; touching the vendored `tools/llm-usage-reader`.

## Consequences

The loop the owner described becomes: **promote an idea → build with any tool →
`record-build` (tokens, time, model, prompts — all machine-observed) → evaluate +
observe (fidelity + what went well/struggled/lessons) → insights + LESSONS.md teach the
next person what that model can and cannot one-shot.**
