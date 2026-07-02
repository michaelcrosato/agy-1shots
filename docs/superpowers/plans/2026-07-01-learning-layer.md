# Learning Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the teaching half of OneShotForge — machine-counted prompt interaction, write-once qualitative observations per attempt, a cross-model insights engine, an Insights dashboard tab, and a generated `LESSONS.md` that teaches newcomers what each model can and cannot one-shot.

**Architecture:** Additive schema fields on `oneshot.json` attempts (`strategy`, `interaction`, `observations`) validated in `dashboard/lib/manifest.js`; capture via `scripts/record-build.js` flags + a new `POST /api/manifest/observations` route; aggregation in pure `dashboard/lib/insights.js` + `dashboard/lib/lessons-md.js`; surfaced via `GET /api/insights`, a new `InsightsTab` component, and `scripts/generate-lessons.mjs` writing `LESSONS.md` at the repo root.

**Tech Stack:** Next.js 15 App Router (JS, no TS), zero-dep Node test scripts, existing BDD e2e runner, prettier 3.4.2 + eslint.

## Global Constraints

- Never modify or delete an existing `spec` block or existing `attempts[]` entries — observations may be **added once** to an attempt that has none, never edited or removed (write-once).
- The model/agent is never the source of benchmark telemetry; `interaction` is machine-counted from transcripts only.
- Quantitative averages (tokens/time/cost) aggregate **benchmark-eligible attempts only**.
- All new dashboard lib files are ESM (`import`), all `scripts/*.js` are CJS (`require`); the new generator is `.mjs`.
- `pricing.js` resolves its CSV from `process.cwd()` = `dashboard/`; any out-of-dashboard entry point must `process.chdir(<repo>/dashboard)` before importing dashboard libs.
- CI runs `prettier --check .` from repo root — run `./dashboard/node_modules/.bin/prettier --write <changed files>` before every commit. Generated `LESSONS.md` must be added to `.prettierignore`.
- Error responses never leak internal detail (`jsonError(status, message)` pattern with generic 500s).
- Commit messages: conventional (`feat:`, `fix:`, `docs:`, `test:`), ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run all commands from repo root `C:\dev\agy-1shots` unless stated.

---

### Task 1: Manifest validators — `strategy`, `interaction`, `observations`

**Files:**

- Modify: `dashboard/lib/manifest.js` (add constants + 3 validators; extend `validateAttemptInput` return)
- Test: `dashboard/lib/manifest.test.mjs` (append checks before the final summary)

**Interfaces:**

- Consumes: existing `ManifestError`, `assertNoProtoKeys`, `normalizeNonNegInt`.
- Produces (used by Tasks 2, 5):

  - `validateStrategy(value) -> string|null` (trimmed, ≤200 chars, null when empty/absent)
  - `validateInteraction(value) -> { userPrompts:number, oneShot:boolean, source:string }|null`
  - `validateObservationsInput(body) -> { wentWell:string[], struggled:string[], lessons:string[] }|null` (null when all lists empty)
  - `validateAttemptInput(body)` additionally returns `strategy` / `interaction` / `observations` (with `notedAt`) keys **only when present**.

- [ ] **Step 1: Write the failing tests**

Append to `dashboard/lib/manifest.test.mjs`, right before the final `console.log`/summary block (match the existing `check` helper style; extend the import list at the top with the three new validators):

```js
// --- Learning-layer validators (strategy / interaction / observations) ---
check('validateStrategy trims and returns null for empty', () => {
  assert.strictEqual(validateStrategy('  plan-first '), 'plan-first');
  assert.strictEqual(validateStrategy(''), null);
  assert.strictEqual(validateStrategy(undefined), null);
  assert.strictEqual(validateStrategy(null), null);
});
check('validateStrategy rejects non-strings and oversized values', () => {
  assert.throws(() => validateStrategy(42), ManifestError);
  assert.throws(() => validateStrategy('x'.repeat(201)), ManifestError);
});
check('validateInteraction derives oneShot from userPrompts', () => {
  assert.deepStrictEqual(validateInteraction({ userPrompts: 1 }), {
    userPrompts: 1,
    oneShot: true,
    source: 'transcript',
  });
  assert.deepStrictEqual(validateInteraction({ userPrompts: 4, source: 'transcript' }), {
    userPrompts: 4,
    oneShot: false,
    source: 'transcript',
  });
  assert.strictEqual(validateInteraction(undefined), null);
  assert.strictEqual(validateInteraction({}), null);
});
check('validateInteraction rejects bad shapes', () => {
  assert.throws(() => validateInteraction([]), ManifestError);
  assert.throws(() => validateInteraction({ userPrompts: -2 }), ManifestError);
  assert.throws(() => validateInteraction({ userPrompts: 1, oneShot: 'yes' }), ManifestError);
});
check('validateObservationsInput normalizes lists and nulls when empty', () => {
  const obs = validateObservationsInput({
    wentWell: [' scaffolding worked '],
    struggled: [],
    lessons: ['GLSL needed fixes', ''],
  });
  assert.deepStrictEqual(obs, {
    wentWell: ['scaffolding worked'],
    struggled: [],
    lessons: ['GLSL needed fixes'],
  });
  assert.strictEqual(validateObservationsInput({ wentWell: [], lessons: [] }), null);
  assert.strictEqual(validateObservationsInput(undefined), null);
});
check('validateObservationsInput rejects bad shapes', () => {
  assert.throws(() => validateObservationsInput({ wentWell: 'not-a-list' }), ManifestError);
  assert.throws(() => validateObservationsInput({ lessons: [42] }), ManifestError);
  assert.throws(() => validateObservationsInput({ lessons: ['x'.repeat(501)] }), ManifestError);
  assert.throws(
    () => validateObservationsInput({ wentWell: Array.from({ length: 21 }, () => 'a') }),
    ManifestError
  );
});
check('validateAttemptInput passes learning fields through when present', () => {
  const fields = validateAttemptInput({
    model: 'test-model',
    strategy: 'plan-first',
    interaction: { userPrompts: 2 },
    observations: { lessons: ['a lesson'] },
  });
  assert.strictEqual(fields.strategy, 'plan-first');
  assert.deepStrictEqual(fields.interaction, {
    userPrompts: 2,
    oneShot: false,
    source: 'transcript',
  });
  assert.deepStrictEqual(fields.observations.lessons, ['a lesson']);
  assert.ok(typeof fields.observations.notedAt === 'string');
  const bare = validateAttemptInput({ model: 'test-model' });
  assert.ok(!('strategy' in bare) && !('interaction' in bare) && !('observations' in bare));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dashboard && node lib/manifest.test.mjs`
Expected: FAIL — `validateStrategy is not defined` (import error).

- [ ] **Step 3: Implement in `dashboard/lib/manifest.js`**

Add constants near the top (after `EVAL_METHODS`):

```js
const OBSERVATION_KEYS = ['wentWell', 'struggled', 'lessons'];
const MAX_OBS_ITEMS = 20;
const MAX_OBS_ITEM_LENGTH = 500;
const MAX_STRATEGY_LENGTH = 200;
```

Add the three validators after `validateEvaluationInput`:

```js
// The prompting variable being tracked (e.g. "single-prompt", "plan-first").
// Free-form by design; null when absent so old attempts stay untouched.
export function validateStrategy(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ManifestError(400, 'strategy must be a string');
  }
  const s = value.trim();
  if (!s) return null;
  if (s.length > MAX_STRATEGY_LENGTH) {
    throw new ManifestError(400, `strategy must be at most ${MAX_STRATEGY_LENGTH} characters`);
  }
  return s;
}

// Machine-observed interaction telemetry (how many human prompts the build
// took). Only recorders that parse a transcript should send this — a human
// never types it, the model never reports it.
export function validateInteraction(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ManifestError(400, 'interaction must be an object');
  }
  assertNoProtoKeys(value, 'interaction');
  const userPrompts = normalizeNonNegInt(value.userPrompts, 'interaction.userPrompts');
  if (userPrompts === null) return null;
  let oneShot = userPrompts <= 1;
  if (value.oneShot !== undefined && value.oneShot !== null) {
    if (typeof value.oneShot !== 'boolean') {
      throw new ManifestError(400, 'interaction.oneShot must be a boolean');
    }
    oneShot = value.oneShot;
  }
  const source =
    typeof value.source === 'string' && value.source.trim() ? value.source.trim() : 'transcript';
  return { userPrompts, oneShot, source };
}

// Qualitative teaching record: what went well, what the model struggled with,
// and portable lessons. Returns null when nothing was actually observed.
export function validateObservationsInput(body) {
  if (body === undefined || body === null) return null;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ManifestError(400, 'observations must be an object');
  }
  assertNoProtoKeys(body, 'observations');
  const out = {};
  let total = 0;
  for (const key of OBSERVATION_KEYS) {
    const raw = body[key];
    if (raw === undefined || raw === null) {
      out[key] = [];
      continue;
    }
    if (!Array.isArray(raw)) {
      throw new ManifestError(400, `observations.${key} must be an array of strings`);
    }
    if (raw.length > MAX_OBS_ITEMS) {
      throw new ManifestError(
        400,
        `observations.${key} has too many entries (max ${MAX_OBS_ITEMS})`
      );
    }
    const cleaned = [];
    for (const item of raw) {
      if (typeof item !== 'string') {
        throw new ManifestError(400, `observations.${key} entries must be strings`);
      }
      const s = item.trim();
      if (!s) continue;
      if (s.length > MAX_OBS_ITEM_LENGTH) {
        throw new ManifestError(
          400,
          `observations.${key} entries must be at most ${MAX_OBS_ITEM_LENGTH} characters`
        );
      }
      cleaned.push(s);
    }
    out[key] = cleaned;
    total += cleaned.length;
  }
  return total === 0 ? null : out;
}
```

Extend `validateAttemptInput`: before its `return`, add

```js
const strategy = validateStrategy(body.strategy);
const interaction = validateInteraction(body.interaction);
const observations = validateObservationsInput(body.observations);
```

and change the returned object to

```js
return {
  model,
  environment,
  build: normalizeCost(body.build, 'build'),
  evaluation,
  ...(strategy ? { strategy } : {}),
  ...(interaction ? { interaction } : {}),
  ...(observations ? { observations: { ...observations, notedAt: new Date().toISOString() } } : {}),
};
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard && node lib/manifest.test.mjs` → all PASS.
Run: `node tests/run-unit.js` (repo root) → all suites PASS.

- [ ] **Step 5: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write dashboard/lib/manifest.js dashboard/lib/manifest.test.mjs
git add dashboard/lib/manifest.js dashboard/lib/manifest.test.mjs
git commit -m "feat(manifest): strategy, interaction, observations attempt fields"
```

---

### Task 2: `record-build.js` — machine-counted prompts + learning flags

**Files:**

- Modify: `scripts/record-build.js`
- Test: `tests/record-build.test.js`

**Interfaces:**

- Consumes: nothing new.
- Produces: attempts written by `record-build.js` may carry `interaction { userPrompts, oneShot, source: 'transcript' }`, `strategy`, `observations { wentWell, struggled, lessons, notedAt }`. Aggregates gain `userPrompts: number|null`. New CLI flags: `--strategy <s>`, `--went-well <t>`, `--struggled <t>`, `--lesson <t>` (last three repeatable).

- [ ] **Step 1: Write the failing tests**

In `tests/record-build.test.js`, extend the Claude fixture in `setup()` — replace the `lines` array with:

```js
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
```

Then add checks (place them next to the existing aggregate assertions; keep any existing expected values for tokens/duration unchanged — the added lines carry no usage):

```js
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
```

Also update the Codex fixture expectations: add to `writeCodexFixture()` lines a user message record

```js
    JSON.stringify({
      type: 'response_item',
      timestamp: '2026-06-20T10:00:02.500Z',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'build it' }],
      },
    }),
```

and a check:

```js
check('parseCodexRollout counts user input messages', () => {
  writeCodexFixture();
  const agg = parseCodexRollout(codexFixture);
  assert.strictEqual(agg.userPrompts, 1);
});
```

(If an existing Codex `messages` count assertion counts `response_item` records, update its expected number accordingly.)

- [ ] **Step 2: Run to verify failure**

Run: `node tests/record-build.test.js`
Expected: FAIL — `agg.userPrompts` is `undefined`.

- [ ] **Step 3: Implement in `scripts/record-build.js`**

(a) Add the human-prompt classifier above `aggregateTranscript`:

```js
// A "human prompt" is a real user turn: type user, not a subagent sidechain,
// not tool_result plumbing, not an injected command/system message. This is a
// heuristic over Claude Code's transcript format, pinned by the fixture test.
function isHumanPrompt(o) {
  if (!o || o.type !== 'user' || !o.message) return false;
  if (o.isSidechain || o.isMeta || o.isCompactSummary) return false;
  const c = o.message.content;
  if (typeof c === 'string') {
    const s = c.trim();
    return s.length > 0 && !s.startsWith('<');
  }
  if (Array.isArray(c)) {
    if (c.some((p) => p && p.type === 'tool_result')) return false;
    return c.some(
      (p) => p && p.type === 'text' && typeof p.text === 'string' && !p.text.trim().startsWith('<')
    );
  }
  return false;
}
```

(b) In `aggregateTranscript`: add `let userPrompts = 0;` beside the other counters; inside the line loop, immediately after the `JSON.parse` try/catch, add

```js
if (isHumanPrompt(o)) userPrompts += 1;
```

and include `userPrompts: userPrompts > 0 ? userPrompts : null` in the returned aggregate.

(c) In `parseCodexRollout`: compute

```js
const userPrompts = recs.filter(
  (r) =>
    r.type === 'response_item' &&
    r.payload &&
    r.payload.type === 'message' &&
    r.payload.role === 'user'
).length;
```

and include `userPrompts: userPrompts > 0 ? userPrompts : null` in its return.

(d) In `buildAttempt(agg, opts)`: build observations from opts and append the optional fields to the returned attempt object (after `evaluation`):

```js
const obs = opts.observations;
const hasObs =
  obs && ['wentWell', 'struggled', 'lessons'].some((k) => Array.isArray(obs[k]) && obs[k].length);
```

and in the return object:

```js
    ...(typeof agg.userPrompts === 'number' && agg.userPrompts > 0
      ? {
          interaction: {
            userPrompts: agg.userPrompts,
            oneShot: agg.userPrompts <= 1,
            source: 'transcript',
          },
        }
      : {}),
    ...(opts.strategy ? { strategy: String(opts.strategy).trim() } : {}),
    ...(hasObs
      ? {
          observations: {
            wentWell: obs.wentWell || [],
            struggled: obs.struggled || [],
            lessons: obs.lessons || [],
            notedAt: new Date().toISOString(),
          },
        }
      : {}),
```

(e) In `main()` `parseArgs` options add:

```js
        strategy: { type: 'string' },
        'went-well': { type: 'string', multiple: true },
        struggled: { type: 'string', multiple: true },
        lesson: { type: 'string', multiple: true },
```

pass them to `buildAttempt`:

```js
const attempt = buildAttempt(agg, {
  effort: values.effort,
  tool: adapter.label,
  strategy: values.strategy,
  observations: {
    wentWell: values['went-well'] || [],
    struggled: values.struggled || [],
    lessons: values.lesson || [],
  },
});
```

and extend the `--help` usage line with the new flags.

(f) Add `userPrompts: attempt.interaction ? attempt.interaction.userPrompts : null` to the printed `summary`.

- [ ] **Step 4: Run tests**

Run: `node tests/record-build.test.js` → all PASS. Then `node tests/run-unit.js` → all PASS.

- [ ] **Step 5: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write scripts/record-build.js tests/record-build.test.js
git add scripts/record-build.js tests/record-build.test.js
git commit -m "feat(record-build): machine-count prompts; strategy + observation flags"
```

---

### Task 3: Insights engine + lessons markdown renderer

**Files:**

- Create: `dashboard/lib/insights.js`
- Create: `dashboard/lib/lessons-md.js`
- Test (create): `dashboard/lib/insights.test.mjs`
- Modify: `tests/run-unit.js` (register the new suite)

**Interfaces:**

- Consumes: `readManifestSync`, `decorateAttempt` from `./manifest.js`.
- Produces (used by Tasks 4, 5, 6):

  - `collectPieces(oneShotsDir) -> [{ id, manifest }]` (attempts decorated)
  - `buildInsights(pieces) -> { totals, models, matrix, lessons }` where:
    - `totals = { oneShots, attempts, models, benchmarkEligible, withInteraction, withObservations }`
    - `models[] = { model, attempts, interactionCount, oneShotCount, oneShotRate:number|null, evaluated, avgFidelity:number|null, verifyRuns, verifyPasses, benchmarkEligibleAttempts, excludedFromAverages, avgTokens:number|null, avgDurationMs:number|null, avgCostUsd:number|null, topStruggles:string[] }` sorted by attempts desc
    - `matrix[] = { oneShotId, cells: { [model]: { attempts, status:'pass'|'scored'|'fail'|'attempted', fidelity:number|null, oneShot:boolean|null, userPrompts:number|null } } }`
    - `lessons[] = { oneShotId, model, timestamp:string|null, text }` newest first
  - `renderLessonsMarkdown(insights, { generatedAt }) -> string`

- [ ] **Step 1: Write the failing test**

Create `dashboard/lib/insights.test.mjs`:

```js
// Unit tests for the insights aggregation + LESSONS.md renderer.
// Run from the dashboard dir: node lib/insights.test.mjs
import assert from 'node:assert';
import { buildInsights } from './insights.js';
import { renderLessonsMarkdown } from './lessons-md.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

function att(over = {}) {
  return {
    id: `att_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: '2026-06-20T10:00:00.000Z',
    model: 'model-a',
    build: { tokens: 1000, durationMs: 60000 },
    estimatedCost: 0.5,
    benchmarkEligible: true,
    evaluation: { method: 'none', fidelityScore: null, passed: null, feedback: '' },
    ...over,
  };
}

const pieces = [
  {
    id: 'alpha',
    manifest: {
      attempts: [
        att({
          interaction: { userPrompts: 1, oneShot: true, source: 'transcript' },
          evaluation: { method: 'program', fidelityScore: null, passed: true, feedback: '' },
          observations: {
            wentWell: ['clean scaffold'],
            struggled: ['flaky shader math'],
            lessons: ['model-a one-shots scaffolding'],
            notedAt: '2026-06-20T11:00:00.000Z',
          },
        }),
        att({
          model: 'model-b',
          timestamp: '2026-06-21T10:00:00.000Z',
          benchmarkEligible: false,
          estimatedCost: null,
          build: { tokens: 999999, durationMs: 1 },
          interaction: { userPrompts: 4, oneShot: false, source: 'transcript' },
          evaluation: { method: 'human', fidelityScore: 70, passed: null, feedback: '' },
          observations: {
            wentWell: [],
            struggled: ['lost the plot on state management'],
            lessons: ['model-b needs a plan first'],
            notedAt: '2026-06-21T11:00:00.000Z',
          },
        }),
      ],
    },
  },
  { id: 'beta', manifest: { attempts: [att({ model: 'model-a', timestamp: null })] } },
];

const insights = buildInsights(pieces);

check('totals count pieces, attempts, models, eligibility, learning coverage', () => {
  assert.deepStrictEqual(insights.totals, {
    oneShots: 2,
    attempts: 3,
    models: 2,
    benchmarkEligible: 2,
    withInteraction: 2,
    withObservations: 2,
  });
});

check('model profiles aggregate correctly and only trusted telemetry averages', () => {
  const a = insights.models.find((m) => m.model === 'model-a');
  assert.strictEqual(a.attempts, 2);
  assert.strictEqual(a.oneShotRate, 1); // 1 of 1 attempts with interaction data
  assert.strictEqual(a.interactionCount, 1);
  assert.strictEqual(a.verifyPasses, 1);
  assert.strictEqual(a.avgTokens, 1000);
  const b = insights.models.find((m) => m.model === 'model-b');
  assert.strictEqual(b.oneShotRate, 0);
  assert.strictEqual(b.avgFidelity, 70);
  // model-b's only attempt is NOT benchmark-eligible: no quantitative averages.
  assert.strictEqual(b.avgTokens, null);
  assert.strictEqual(b.avgCostUsd, null);
  assert.strictEqual(b.excludedFromAverages, 1);
  assert.deepStrictEqual(b.topStruggles, ['lost the plot on state management']);
});

check('matrix picks the best outcome per (one-shot, model)', () => {
  const alpha = insights.matrix.find((r) => r.oneShotId === 'alpha');
  assert.strictEqual(alpha.cells['model-a'].status, 'pass');
  assert.strictEqual(alpha.cells['model-a'].oneShot, true);
  assert.strictEqual(alpha.cells['model-b'].status, 'scored');
  assert.strictEqual(alpha.cells['model-b'].fidelity, 70);
  assert.strictEqual(alpha.cells['model-b'].userPrompts, 4);
  const beta = insights.matrix.find((r) => r.oneShotId === 'beta');
  assert.strictEqual(beta.cells['model-a'].status, 'attempted');
});

check('lessons feed is attributed and newest first', () => {
  assert.strictEqual(insights.lessons.length, 2);
  assert.strictEqual(insights.lessons[0].text, 'model-b needs a plan first');
  assert.strictEqual(insights.lessons[0].model, 'model-b');
  assert.strictEqual(insights.lessons[1].oneShotId, 'alpha');
});

check('empty input produces zeroed, renderable insights', () => {
  const empty = buildInsights([]);
  assert.strictEqual(empty.totals.attempts, 0);
  assert.deepStrictEqual(empty.models, []);
  assert.deepStrictEqual(empty.lessons, []);
});

check('renderLessonsMarkdown renders data sections', () => {
  const md = renderLessonsMarkdown(insights, { generatedAt: '2026-07-01' });
  assert.ok(md.includes('# What can AI coding tools actually build in one shot?'));
  assert.ok(md.includes('model-b needs a plan first'));
  assert.ok(md.includes('model-a'));
  assert.ok(md.includes('Glossary'));
  assert.ok(md.includes('2026-07-01'));
});

check('renderLessonsMarkdown renders honest empty states', () => {
  const md = renderLessonsMarkdown(buildInsights([]), { generatedAt: '2026-07-01' });
  assert.ok(md.includes('No attempts recorded yet'));
  assert.ok(md.includes('No lessons recorded yet'));
});

console.log(`\n${passed} insights checks passed.`);
```

- [ ] **Step 2: Run to verify failure**

Run: `cd dashboard && node lib/insights.test.mjs`
Expected: FAIL — cannot find module `./insights.js`.

- [ ] **Step 3: Implement `dashboard/lib/insights.js`**

```js
import fs from 'fs';
import path from 'path';
import { readManifestSync, decorateAttempt } from './manifest.js';

// Cross-one-shot aggregation for the teaching layer: per-model profiles, a
// model × one-shot scoreboard, and a lessons feed. Pure over its input so it
// is unit-testable; collectPieces() is the one filesystem entry point.
//
// Integrity rule (matches the repo's evidence philosophy): quantitative
// averages — tokens, duration, cost — are computed over benchmark-eligible
// attempts ONLY. Qualitative signals (fidelity, one-shot rate, observations)
// are human/machine judgments and are aggregated wherever present.

export function collectPieces(oneShotsDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(oneShotsDir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const pieces = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(oneShotsDir, e.name);
    try {
      if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    } catch (err) {
      continue;
    }
    const manifest = readManifestSync(dir);
    pieces.push({
      id: e.name,
      manifest: {
        ...manifest,
        attempts: (manifest.attempts || []).map(decorateAttempt),
      },
    });
  }
  return pieces;
}

function avg(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const STATUS_RANK = { attempted: 1, fail: 2, scored: 3, pass: 4 };

function newProfile(model) {
  return {
    model,
    attempts: 0,
    interactionCount: 0,
    oneShotCount: 0,
    evaluated: 0,
    fidelities: [],
    verifyRuns: 0,
    verifyPasses: 0,
    eligible: 0,
    tokens: [],
    durations: [],
    costs: [],
    struggles: [],
  };
}

export function buildInsights(pieces) {
  const profiles = new Map();
  const matrix = [];
  const lessons = [];
  let attemptsTotal = 0;
  let eligibleTotal = 0;
  let withInteraction = 0;
  let withObservations = 0;

  for (const piece of pieces) {
    const attempts = (piece.manifest && piece.manifest.attempts) || [];
    const cells = {};

    for (const a of attempts) {
      attemptsTotal += 1;
      const model =
        typeof a.model === 'string' && a.model.trim() ? a.model.trim() : '(unknown model)';
      const p = profiles.get(model) || newProfile(model);
      p.attempts += 1;

      const inter = a.interaction;
      const hasInteraction = !!(inter && typeof inter.userPrompts === 'number');
      if (hasInteraction) {
        p.interactionCount += 1;
        withInteraction += 1;
        if (inter.oneShot === true) p.oneShotCount += 1;
      }

      const ev = a.evaluation || {};
      const hasFidelity = typeof ev.fidelityScore === 'number';
      const hasVerify = ev.method === 'program' && typeof ev.passed === 'boolean';
      if (hasFidelity || hasVerify) p.evaluated += 1;
      if (hasFidelity) p.fidelities.push(ev.fidelityScore);
      if (hasVerify) {
        p.verifyRuns += 1;
        if (ev.passed) p.verifyPasses += 1;
      }

      if (a.benchmarkEligible) {
        p.eligible += 1;
        eligibleTotal += 1;
        if (a.build && typeof a.build.tokens === 'number') p.tokens.push(a.build.tokens);
        if (a.build && typeof a.build.durationMs === 'number') p.durations.push(a.build.durationMs);
        if (typeof a.estimatedCost === 'number') p.costs.push(a.estimatedCost);
      }

      const obs = a.observations;
      if (obs && typeof obs === 'object') {
        withObservations += 1;
        for (const text of Array.isArray(obs.struggled) ? obs.struggled : []) {
          p.struggles.push({ text, timestamp: a.timestamp || null });
        }
        for (const text of Array.isArray(obs.lessons) ? obs.lessons : []) {
          lessons.push({ oneShotId: piece.id, model, timestamp: a.timestamp || null, text });
        }
      }
      profiles.set(model, p);

      // --- matrix cell: keep the best outcome seen for (one-shot, model) ---
      const cell =
        cells[model] ||
        (cells[model] = {
          attempts: 0,
          status: 'attempted',
          fidelity: null,
          oneShot: null,
          userPrompts: null,
        });
      cell.attempts += 1;
      if (hasInteraction) {
        cell.oneShot = cell.oneShot === true ? true : inter.oneShot === true;
        cell.userPrompts =
          cell.userPrompts === null
            ? inter.userPrompts
            : Math.min(cell.userPrompts, inter.userPrompts);
      }
      if (hasFidelity && (cell.fidelity === null || ev.fidelityScore > cell.fidelity)) {
        cell.fidelity = ev.fidelityScore;
      }
      let status = 'attempted';
      if (hasVerify) status = ev.passed ? 'pass' : 'fail';
      else if (hasFidelity) status = 'scored';
      if (STATUS_RANK[status] > STATUS_RANK[cell.status]) cell.status = status;
    }

    matrix.push({ oneShotId: piece.id, cells });
  }

  const models = [...profiles.values()]
    .map((p) => ({
      model: p.model,
      attempts: p.attempts,
      interactionCount: p.interactionCount,
      oneShotCount: p.oneShotCount,
      oneShotRate: p.interactionCount > 0 ? p.oneShotCount / p.interactionCount : null,
      evaluated: p.evaluated,
      avgFidelity: avg(p.fidelities),
      verifyRuns: p.verifyRuns,
      verifyPasses: p.verifyPasses,
      benchmarkEligibleAttempts: p.eligible,
      excludedFromAverages: p.attempts - p.eligible,
      avgTokens: avg(p.tokens),
      avgDurationMs: avg(p.durations),
      avgCostUsd: avg(p.costs),
      topStruggles: p.struggles
        .slice()
        .sort((x, y) => String(y.timestamp || '').localeCompare(String(x.timestamp || '')))
        .slice(0, 5)
        .map((s) => s.text),
    }))
    .sort((a, b) => b.attempts - a.attempts || a.model.localeCompare(b.model));

  lessons.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  return {
    totals: {
      oneShots: pieces.length,
      attempts: attemptsTotal,
      models: models.length,
      benchmarkEligible: eligibleTotal,
      withInteraction,
      withObservations,
    },
    models,
    matrix,
    lessons,
  };
}
```

- [ ] **Step 4: Implement `dashboard/lib/lessons-md.js`**

```js
// Renders the insights aggregate into LESSONS.md — the repo's static teaching
// artifact, readable on GitHub without running anything. Pure: string in/out.

export const GLOSSARY = [
  {
    term: 'One-shot',
    def: 'A self-contained project an AI coding tool builds from a single written vision. "One-shot" as an outcome means it worked from one prompt, with no human corrections.',
  },
  {
    term: 'Token',
    def: 'The unit AI models read and write text in (roughly ¾ of a word). Build tokens measure how much work — and money — a build consumed.',
  },
  {
    term: 'Fidelity',
    def: 'A human score (0–100%) of how closely the built result matches the written vision.',
  },
  {
    term: 'Evidence level',
    def: "Where a measurement came from. Only machine-observed sources (the tool's own session records or provider usage exports) are trusted — the model is never asked to report its own numbers.",
  },
  {
    term: 'Benchmark-eligible',
    def: 'An attempt whose token/time telemetry came from a trusted, measured source. Only these attempts are averaged in quantitative comparisons.',
  },
];

function pct(rate) {
  return `${Math.round(rate * 100)}%`;
}

function fmtTokens(n) {
  if (typeof n !== 'number') return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function fmtMs(ms) {
  if (typeof ms !== 'number') return '—';
  const mins = ms / 60000;
  if (mins >= 60) return `${(mins / 60).toFixed(1)} h`;
  if (mins >= 1) return `${mins.toFixed(1)} min`;
  return `${Math.round(ms / 1000)} s`;
}

function fmtCost(c) {
  return typeof c === 'number' ? `$${c.toFixed(2)}` : '—';
}

function cellText(cell) {
  if (!cell) return '—';
  const prompts =
    typeof cell.userPrompts === 'number'
      ? cell.userPrompts === 1
        ? '1 prompt'
        : `${cell.userPrompts} prompts`
      : null;
  switch (cell.status) {
    case 'pass':
      return `✅ verified${prompts ? ` (${prompts})` : ''}`;
    case 'fail':
      return `❌ failed verify${prompts ? ` (${prompts})` : ''}`;
    case 'scored':
      return `${cell.fidelity}% fidelity${prompts ? ` (${prompts})` : ''}`;
    default:
      return `🔸 attempted, not evaluated${prompts ? ` (${prompts})` : ''}`;
  }
}

export function renderLessonsMarkdown(insights, { generatedAt } = {}) {
  const { totals, models, matrix, lessons } = insights;
  const lines = [];
  const push = (...xs) => lines.push(...xs);

  push(
    '# What can AI coding tools actually build in one shot?',
    '',
    '<!-- Generated by `node scripts/generate-lessons.mjs` — do not edit by hand. -->',
    '',
    'Every project in [`one-shots/`](one-shots/) starts from a written **vision** and is',
    'built by an AI coding tool. Each build attempt is recorded with machine-observed',
    'telemetry — which model, how many tokens, how long, how many human prompts it took —',
    'plus a human evaluation of how close the result came to the vision. This file is the',
    'digest: what the data says each model can and cannot do, regenerated from',
    '`one-shots/*/oneshot.json` after every recorded attempt.',
    ''
  );
  push(
    `_Data as of ${generatedAt || 'now'}: ${totals.oneShots} one-shot(s), ${totals.attempts} attempt(s), ` +
      `${totals.models} model(s). ${totals.benchmarkEligible} attempt(s) carry trusted (benchmark-eligible) telemetry._`,
    ''
  );

  push('## Scoreboard — one-shot × model', '');
  if (totals.attempts === 0 || models.length === 0) {
    push(
      'No attempts recorded yet. Build a one-shot with any AI coding tool, then run',
      '`node scripts/record-build.js --id <one-shot>` to add the first data point.',
      ''
    );
  } else {
    const names = models.map((m) => m.model);
    push(`| One-shot | ${names.join(' | ')} |`);
    push(`| --- | ${names.map(() => '---').join(' | ')} |`);
    for (const row of matrix) {
      push(`| \`${row.oneShotId}\` | ${names.map((n) => cellText(row.cells[n])).join(' | ')} |`);
    }
    push('');
  }

  push('## Model profiles', '');
  if (models.length === 0) {
    push('No models seen yet.', '');
  }
  for (const m of models) {
    push(`### ${m.model}`, '');
    push(`- **Attempts:** ${m.attempts} (${m.benchmarkEligibleAttempts} benchmark-eligible)`);
    push(
      `- **One-shot rate:** ${
        m.oneShotRate === null
          ? 'unknown (no prompt-count data yet)'
          : `${pct(m.oneShotRate)} (${m.oneShotCount}/${m.interactionCount} measured attempts)`
      }`
    );
    push(
      `- **Evaluations:** ${m.evaluated} — avg fidelity ${
        m.avgFidelity === null ? '—' : `${Math.round(m.avgFidelity)}%`
      }, acceptance tests ${m.verifyPasses}/${m.verifyRuns} passed`
    );
    push(
      `- **Avg build (trusted telemetry only${
        m.excludedFromAverages > 0 ? `; ${m.excludedFromAverages} attempt(s) excluded` : ''
      }):** ${fmtTokens(m.avgTokens)} tokens · ${fmtMs(m.avgDurationMs)} · ${fmtCost(m.avgCostUsd)}`
    );
    if (m.topStruggles.length > 0) {
      push(`- **Recent struggles:**`);
      for (const s of m.topStruggles) push(`  - ${s}`);
    }
    push('');
  }

  push('## Lessons learned', '');
  if (lessons.length === 0) {
    push(
      'No lessons recorded yet. After evaluating an attempt, add observations from the',
      'dashboard (Details → Evaluate → Observations) or record them with the build:',
      '`node scripts/record-build.js --id <one-shot> --lesson "..."`.',
      ''
    );
  } else {
    for (const l of lessons) {
      const date = l.timestamp ? ` (${String(l.timestamp).slice(0, 10)})` : '';
      push(`- **${l.text}** — ${l.model} on \`${l.oneShotId}\`${date}`);
    }
    push('');
  }

  push(
    '## Add your own data point',
    '',
    '1. Pick an idea (`IDEAS.md`) and promote it: `python scripts/promote.py <ID>` — or write a vision for a new folder in `one-shots/`.',
    '2. Give the ready-to-copy prompt to any AI coding tool and let it build.',
    '3. Record the attempt (telemetry is read from the tool’s own session records):',
    '   `node scripts/record-build.js --id <one-shot> --strategy single-prompt --lesson "what you learned"`',
    '4. Evaluate it in the dashboard (`cd dashboard && npm run dev`): fidelity score, acceptance test, observations.',
    '5. This file regenerates automatically — commit it with your attempt.',
    ''
  );

  push('## Glossary', '');
  for (const g of GLOSSARY) {
    push(`- **${g.term}** — ${g.def}`);
  }
  push('');

  return lines.join('\n');
}
```

- [ ] **Step 5: Register suite in `tests/run-unit.js`**

Add to the `suites` array (after the `manifest` entry):

```js
  { name: 'insights', file: 'lib/insights.test.mjs', cwd: path.join(repoRoot, 'dashboard') },
```

- [ ] **Step 6: Run tests**

Run: `cd dashboard && node lib/insights.test.mjs` → all PASS.
Run: `node tests/run-unit.js` → all suites (now 6) PASS.

- [ ] **Step 7: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write dashboard/lib/insights.js dashboard/lib/lessons-md.js dashboard/lib/insights.test.mjs tests/run-unit.js
git add dashboard/lib/insights.js dashboard/lib/lessons-md.js dashboard/lib/insights.test.mjs tests/run-unit.js
git commit -m "feat(insights): cross-model aggregation engine + LESSONS.md renderer"
```

---

### Task 4: `LESSONS.md` generation — lib helper, CLI script, record-build hook

**Files:**

- Create: `dashboard/lib/lessons-file.js`
- Create: `scripts/generate-lessons.mjs`
- Modify: `scripts/record-build.js` (regeneration hook after append)
- Modify: `.prettierignore` (+ `LESSONS.md`)
- Create (generated): `LESSONS.md`

**Interfaces:**

- Consumes: `collectPieces`, `buildInsights` (Task 3), `renderLessonsMarkdown` (Task 3), `writeFileAtomic` from `dashboard/lib/atomic-file.js` (synchronous).
- Produces (used by Task 5 routes): `regenerateLessonsFile({ oneShotsDir?, outPath? }) -> { ok:boolean, outPath?:string, error?:string }` — never throws.

- [ ] **Step 1: Implement `dashboard/lib/lessons-file.js`**

```js
import path from 'path';
import { collectPieces, buildInsights } from './insights.js';
import { renderLessonsMarkdown } from './lessons-md.js';
import { writeFileAtomic } from './atomic-file.js';

// Regenerate the repo-root LESSONS.md teaching artifact from every one-shot
// manifest. Defaults assume cwd = dashboard/ (how Next.js and the unit suites
// run); out-of-dashboard callers pass explicit paths or chdir first.
// Never throws: a failed regeneration must not fail the write that caused it.
export function regenerateLessonsFile({ oneShotsDir, outPath } = {}) {
  try {
    const dir = oneShotsDir || path.resolve(process.cwd(), '../one-shots');
    const out = outPath || path.resolve(process.cwd(), '../LESSONS.md');
    const insights = buildInsights(collectPieces(dir));
    const md = renderLessonsMarkdown(insights, {
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    writeFileAtomic(out, md);
    return { ok: true, outPath: out };
  } catch (e) {
    console.error('LESSONS.md regeneration failed:', e.message);
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 2: Implement `scripts/generate-lessons.mjs`**

```js
#!/usr/bin/env node
// Regenerates the repo-root LESSONS.md from all one-shot manifests.
//   node scripts/generate-lessons.mjs
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// pricing.js resolves its CSV from process.cwd() (Next.js always runs with
// cwd = dashboard/), so match that before importing any dashboard lib.
process.chdir(path.join(repoRoot, 'dashboard'));

const { regenerateLessonsFile } = await import(
  pathToFileURL(path.join(repoRoot, 'dashboard', 'lib', 'lessons-file.js')).href
);

const res = regenerateLessonsFile({
  oneShotsDir: path.join(repoRoot, 'one-shots'),
  outPath: path.join(repoRoot, 'LESSONS.md'),
});
if (!res.ok) {
  console.error(`Failed to generate LESSONS.md: ${res.error}`);
  process.exit(1);
}
console.log(`Wrote ${res.outPath}`);
```

- [ ] **Step 3: Hook into `scripts/record-build.js`**

In `main()`, after the `appendAttempt(...)` call and before the final `console.log(JSON.stringify(summary, null, 2))`, add:

```js
// Refresh the teaching artifact. Best-effort: the attempt is already safely
// recorded, so a regeneration failure must not fail the recording.
const gen = require('child_process').spawnSync(
  process.execPath,
  [path.join(__dirname, 'generate-lessons.mjs')],
  { cwd: repoRoot, stdio: 'pipe' }
);
if (gen.status !== 0) {
  console.error('warning: LESSONS.md regeneration failed (attempt was still recorded).');
}
```

- [ ] **Step 4: Add `LESSONS.md` to `.prettierignore`**

Append under the existing "Generated by scripts/promote.py" block:

```
# Generated by scripts/generate-lessons.mjs + the manifest API routes.
LESSONS.md
```

- [ ] **Step 5: Generate and verify**

Run: `node scripts/generate-lessons.mjs`
Expected: `Wrote C:\dev\agy-1shots\LESSONS.md`; file contains the scoreboard with the four existing one-shots and honest empty states for lessons.
Run: `node tests/run-unit.js` → all PASS (no regressions).
Run: `node tests/record-build.test.js` → PASS (dry-run path skips the hook; the non-dry-run test, if any, tolerates the hook because it exits 0 or only warns).

- [ ] **Step 6: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write dashboard/lib/lessons-file.js scripts/generate-lessons.mjs scripts/record-build.js .prettierignore
git add dashboard/lib/lessons-file.js scripts/generate-lessons.mjs scripts/record-build.js .prettierignore LESSONS.md
git commit -m "feat(lessons): generated LESSONS.md teaching artifact + regeneration hooks"
```

---

### Task 5: API routes — observations POST, insights GET, regeneration hooks

**Files:**

- Create: `dashboard/app/api/manifest/observations/route.js`
- Create: `dashboard/app/api/insights/route.js`
- Modify: `dashboard/app/api/manifest/attempt/route.js`, `dashboard/app/api/manifest/evaluation/route.js`, `dashboard/app/api/manifest/verify/route.js` (call `regenerateLessonsFile()` after a successful manifest write)

**Interfaces:**

- Consumes: Task 1 validators, Task 3 `collectPieces`/`buildInsights`, Task 4 `regenerateLessonsFile`.
- Produces:

  - `POST /api/manifest/observations` `{ id, attemptId, wentWell?, struggled?, lessons? }` → `{ success:true, observations }`; 400 invalid/empty, 404 unknown id/attempt, 409 write-once conflict.
  - `GET /api/insights` → the `buildInsights` shape.

- [ ] **Step 1: Create `dashboard/app/api/manifest/observations/route.js`**

```js
import { NextResponse } from 'next/server';
import {
  resolveOneShot,
  updateManifest,
  validateObservationsInput,
  ManifestError,
} from '../../../../lib/manifest';
import { regenerateLessonsFile } from '../../../../lib/lessons-file';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

function jsonError(status, message) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/manifest/observations  { id, attemptId, wentWell?, struggled?, lessons? }
// Adds the qualitative teaching record to an existing attempt. Write-once:
// observations may be ADDED to an attempt that has none, never edited or
// removed — telemetry and history stay immutable (409 on conflict).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonError(400, 'Bad Request');
  }
  if (!body || typeof body.id !== 'string') {
    return jsonError(400, 'Bad Request');
  }
  if (typeof body.attemptId !== 'string' || !body.attemptId) {
    return jsonError(400, 'Bad Request: attemptId is required');
  }

  const resolved = resolveOneShot(body.id);
  if (!resolved.ok) {
    return jsonError(resolved.status, 'Not Found');
  }

  let observations;
  try {
    const validated = validateObservationsInput({
      wentWell: body.wentWell,
      struggled: body.struggled,
      lessons: body.lessons,
    });
    if (!validated) {
      return jsonError(400, 'At least one observation entry is required');
    }
    observations = { ...validated, notedAt: new Date().toISOString() };
    await updateManifest(resolved.targetDir, resolved.manifestPath, (current) => {
      const attempt = current.attempts.find((a) => a.id === body.attemptId);
      if (!attempt) {
        throw new ManifestError(404, 'Attempt not found');
      }
      if (attempt.observations && typeof attempt.observations === 'object') {
        throw new ManifestError(409, 'Observations already recorded for this attempt (write-once)');
      }
      attempt.observations = observations;
      return current;
    });
  } catch (e) {
    if (e instanceof ManifestError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(500, 'Internal Server Error');
  }

  regenerateLessonsFile();
  return NextResponse.json({ success: true, observations });
}
```

- [ ] **Step 2: Create `dashboard/app/api/insights/route.js`**

```js
import path from 'path';
import { NextResponse } from 'next/server';
import { collectPieces, buildInsights } from '../../../lib/insights';

export const dynamic = 'force-dynamic';

// GET /api/insights — the teaching aggregate: per-model profiles, the
// one-shot × model scoreboard, and the lessons feed.
export async function GET() {
  try {
    const pieces = collectPieces(path.resolve(process.cwd(), '../one-shots'));
    return NextResponse.json(buildInsights(pieces));
  } catch (e) {
    console.error('Error building insights:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add regeneration hooks**

In `attempt/route.js`, `evaluation/route.js`, and `verify/route.js`: import `regenerateLessonsFile` from the appropriate relative `lib/lessons-file` path and call `regenerateLessonsFile();` immediately before the final success `return NextResponse.json(...)` (after the manifest write succeeded). For `verify/route.js`, read the file first and place the call after its successful evaluation write, before its success response. Do NOT add it to any error path.

- [ ] **Step 4: Build check**

Run: `cd dashboard && npm run build`
Expected: compiles clean; `/api/insights` and `/api/manifest/observations` listed in the route table.

- [ ] **Step 5: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write "dashboard/app/api/**/*.js"
git add dashboard/app/api
git commit -m "feat(api): observations write-once route + insights aggregate route"
```

---

### Task 6: Dashboard UI — Insights tab + observations capture

**Files:**

- Create: `dashboard/app/components/InsightsTab.jsx`
- Modify: `dashboard/app/DashboardClient.jsx` (import + nav button + tab branch; observations panel in `AttemptRow`)

**Interfaces:**

- Consumes: `GET /api/insights`, `POST /api/manifest/observations`.
- Produces: `<InsightsTab />` (no props); `AttemptRow` gains an Observations section inside its expanded panel.

- [ ] **Step 1: Create `dashboard/app/components/InsightsTab.jsx`**

```jsx
'use client';

import React, { useEffect, useState } from 'react';

// The teaching view: what the recorded attempts say each model can and cannot
// one-shot. Everything here is derived from oneshot.json manifests via
// /api/insights — nothing is hand-maintained.

const GLOSSARY = {
  'one-shot': 'Built correctly from a single prompt, with no human corrections.',
  token: 'The unit models read/write text in (~¾ of a word). Measures work and cost.',
  fidelity: 'Human score (0–100%) of how closely the result matches the written vision.',
  'benchmark-eligible':
    'Attempt whose token/time telemetry came from a trusted, machine-observed source. Only these are averaged.',
  prompts: 'Human messages the build session needed — counted from the session transcript.',
};

function Term({ k, children }) {
  return (
    <span
      className="underline decoration-dotted decoration-slate-500 cursor-help"
      title={GLOSSARY[k]}
    >
      {children}
    </span>
  );
}

function pct(rate) {
  return `${Math.round(rate * 100)}%`;
}

function fmtTokens(n) {
  if (typeof n !== 'number') return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

function fmtMs(ms) {
  if (typeof ms !== 'number') return '—';
  const mins = ms / 60000;
  if (mins >= 60) return `${(mins / 60).toFixed(1)} h`;
  if (mins >= 1) return `${mins.toFixed(1)} min`;
  return `${Math.round(ms / 1000)} s`;
}

function cellBadge(cell) {
  if (!cell) return <span className="text-slate-600">—</span>;
  const prompts =
    typeof cell.userPrompts === 'number'
      ? ` · ${cell.userPrompts} prompt${cell.userPrompts === 1 ? '' : 's'}`
      : '';
  switch (cell.status) {
    case 'pass':
      return <span className="text-green-400">✅ verified{prompts}</span>;
    case 'fail':
      return <span className="text-red-400">❌ failed verify{prompts}</span>;
    case 'scored':
      return (
        <span className="text-amber-300">
          {cell.fidelity}% fidelity{prompts}
        </span>
      );
    default:
      return <span className="text-slate-400">🔸 attempted{prompts}</span>;
  }
}

export default function InsightsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/insights');
        const json = await res.json();
        if (!cancelled) {
          if (res.ok) setData(json);
          else setError(json.error || 'Failed to load insights.');
        }
      } catch (e) {
        if (!cancelled) setError('Network error loading insights.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="text-slate-400">Loading insights…</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!data) return null;

  const { totals, models, matrix, lessons } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Insights</h1>
        <p className="text-slate-400 mt-2 max-w-3xl">
          What the recorded attempts say each model can — and cannot —{' '}
          <Term k="one-shot">one-shot</Term>. Every number below is machine-observed from build
          sessions or human-scored against each project’s written vision; the model is never asked
          to report its own numbers.
        </p>
        <p className="text-slate-500 text-sm mt-2">
          {totals.oneShots} one-shots · {totals.attempts} attempts · {totals.models} models ·{' '}
          {totals.benchmarkEligible} <Term k="benchmark-eligible">benchmark-eligible</Term>
        </p>
      </div>

      {totals.attempts === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-slate-300 max-w-3xl">
          <div className="font-semibold text-white mb-2">No attempts recorded yet</div>
          <p className="text-sm">
            Build a one-shot with any AI coding tool, then record it with{' '}
            <code className="text-amber-300">
              node scripts/record-build.js --id &lt;one-shot&gt;
            </code>
            . Attempts, evaluations, and observations will show up here automatically.
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-xl font-bold text-white mb-3">Scoreboard — one-shot × model</h2>
            <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 px-3">One-shot</th>
                    {models.map((m) => (
                      <th key={m.model} className="py-2 px-3">
                        {m.model}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.oneShotId} className="border-b border-slate-700/50">
                      <td className="py-2 px-3 font-mono text-slate-200">{row.oneShotId}</td>
                      {models.map((m) => (
                        <td key={m.model} className="py-2 px-3">
                          {cellBadge(row.cells[m.model])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Model profiles</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {models.map((m) => (
                <div key={m.model} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <div className="font-semibold text-white">{m.model}</div>
                  <dl className="mt-2 text-sm text-slate-300 space-y-1">
                    <div className="flex justify-between">
                      <dt>Attempts</dt>
                      <dd>
                        {m.attempts}{' '}
                        <span className="text-slate-500">
                          ({m.benchmarkEligibleAttempts} eligible)
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        <Term k="one-shot">One-shot rate</Term>
                      </dt>
                      <dd>
                        {m.oneShotRate === null
                          ? '—'
                          : `${pct(m.oneShotRate)} (${m.oneShotCount}/${m.interactionCount})`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        Avg <Term k="fidelity">fidelity</Term>
                      </dt>
                      <dd>{m.avgFidelity === null ? '—' : `${Math.round(m.avgFidelity)}%`}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Acceptance tests</dt>
                      <dd>
                        {m.verifyRuns === 0 ? '—' : `${m.verifyPasses}/${m.verifyRuns} passed`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>
                        Avg build (<Term k="benchmark-eligible">trusted only</Term>)
                      </dt>
                      <dd>
                        {fmtTokens(m.avgTokens)} tok · {fmtMs(m.avgDurationMs)} ·{' '}
                        {typeof m.avgCostUsd === 'number' ? `$${m.avgCostUsd.toFixed(2)}` : '—'}
                      </dd>
                    </div>
                  </dl>
                  {m.topStruggles.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                        Recent struggles
                      </div>
                      <ul className="text-sm text-red-300/90 list-disc list-inside space-y-0.5">
                        {m.topStruggles.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Lessons learned</h2>
            {lessons.length === 0 ? (
              <p className="text-slate-400 text-sm max-w-3xl">
                No lessons recorded yet. After evaluating an attempt, add observations in its
                Details panel — what went well, what the model struggled with, and the takeaway.
              </p>
            ) : (
              <ul className="space-y-2 max-w-3xl">
                {lessons.map((l, i) => (
                  <li key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-slate-100">{l.text}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {l.model} on <span className="font-mono">{l.oneShotId}</span>
                      {l.timestamp ? ` · ${String(l.timestamp).slice(0, 10)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into `DashboardClient.jsx`**

(a) Add import after the React import: `import InsightsTab from './components/InsightsTab';`

(b) In the sidebar `<nav>` (after the Ideas Registry button, `:1128-1137`) add:

```jsx
<button
  onClick={() => handleTabChange('insights')}
  className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded transition-colors ${
    activeTab === 'insights'
      ? 'bg-blue-600 text-white font-medium'
      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
  }`}
>
  <span>Insights</span>
</button>
```

(c) In the main content area, change `{activeTab === 'ideas' ? (` to a chain that renders `<InsightsTab />` when `activeTab === 'insights'`:

```jsx
        {activeTab === 'insights' ? (
          <InsightsTab />
        ) : activeTab === 'ideas' ? (
```

(keep the existing ideas/dashboard branches untouched).

- [ ] **Step 3: Observations panel in `AttemptRow`**

Inside `AttemptRow`, add state after the existing state hooks:

```jsx
const obs = attempt.observations || null;
const [wentWell, setWentWell] = useState('');
const [struggled, setStruggled] = useState('');
const [lessonsText, setLessonsText] = useState('');
const [savingObs, setSavingObs] = useState(false);
const [obsError, setObsError] = useState('');

const saveObservations = async () => {
  setSavingObs(true);
  setObsError('');
  const toList = (s) =>
    s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  try {
    const res = await fetch('/api/manifest/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        attemptId: attempt.id,
        wentWell: toList(wentWell),
        struggled: toList(struggled),
        lessons: toList(lessonsText),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onChanged();
    } else {
      setObsError(data.error || 'Failed to save observations.');
    }
  } catch (e) {
    setObsError('Network error saving observations.');
  } finally {
    setSavingObs(false);
  }
};
```

In the expanded panel JSX, after the verify output block (`{verifyOut && (...)}`), add:

```jsx
              <div className="border-t border-slate-800" />
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                  Observations — what should the next person know?
                </div>
                {obs ? (
                  <div className="grid sm:grid-cols-3 gap-4 text-sm">
                    {[
                      ['Went well', obs.wentWell, 'text-green-300'],
                      ['Struggled', obs.struggled, 'text-red-300'],
                      ['Lessons', obs.lessons, 'text-amber-300'],
                    ].map(([label, items, cls]) => (
                      <div key={label}>
                        <div className={`text-[11px] ${cls} mb-1`}>{label}</div>
                        {items && items.length > 0 ? (
                          <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                            {items.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <textarea
                        value={wentWell}
                        onChange={(e) => setWentWell(e.target.value)}
                        rows={3}
                        placeholder={'What went well?\n(one per line)'}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <textarea
                        value={struggled}
                        onChange={(e) => setStruggled(e.target.value)}
                        rows={3}
                        placeholder={'What did the model struggle with?\n(one per line)'}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <textarea
                        value={lessonsText}
                        onChange={(e) => setLessonsText(e.target.value)}
                        rows={3}
                        placeholder={'Lessons for the next person\n(one per line)'}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveObservations}
                        disabled={savingObs}
                        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:bg-amber-900 text-white text-sm font-medium rounded transition-colors"
                      >
                        {savingObs ? 'Saving…' : 'Save Observations (write-once)'}
                      </button>
                      {obsError && <span className="text-xs text-red-400">{obsError}</span>}
                    </div>
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Build + lint**

Run: `cd dashboard && npm run lint && npm run build`
Expected: no lint errors; build succeeds.

- [ ] **Step 5: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write dashboard/app/components/InsightsTab.jsx dashboard/app/DashboardClient.jsx
git add dashboard/app/components/InsightsTab.jsx dashboard/app/DashboardClient.jsx
git commit -m "feat(dashboard): Insights tab + write-once observations capture"
```

---

### Task 7: E2E gate — F15 insights + observations

**Files:**

- Create: `tests/e2e/cases/f15_insights.test.js` (auto-discovered by the runner)

**Interfaces:**

- Consumes: live routes from Task 5; runner globals `describe/test/expect/afterEach/afterAll`, env `DASHBOARD_URL`.

- [ ] **Step 1: Write the e2e case**

```js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// F15: Learning layer — write-once observations + the insights aggregate.
//
// Exercises the REAL /api/manifest/observations and /api/insights routes
// against the live app, including the write-once (409) invariant and the
// LESSONS.md regeneration side effect.
describe('F15: Insights & Observations', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const repoRoot = path.resolve(__dirname, '../../..');
  const oneShotsDir = path.join(repoRoot, 'one-shots');
  const lessonsPath = path.join(repoRoot, 'LESSONS.md');
  const tempDirs = [];

  function rm(p) {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  }

  function mkOneShot(name, attempts) {
    const dir = path.join(oneShotsDir, name);
    rm(dir);
    fs.mkdirSync(dir, { recursive: true });
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        description: 'temp learning-layer fixture',
        tags: ['test'],
        scripts: { start: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' },
      })
    );
    fs.writeFileSync(
      path.join(dir, 'oneshot.json'),
      JSON.stringify({
        schemaVersion: 1,
        spec: {
          vision: 'Temp fixture vision.',
          createdAt: '2026-07-01T00:00:00.000Z',
          acceptance: { mode: 'human', script: 'verify', successExitCode: 0 },
        },
        attempts,
      })
    );
    return dir;
  }

  async function postObs(payload) {
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    return { status: res.status, body };
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      rm(tempDirs.pop());
    }
  });

  afterAll(() => {
    // Temp fixtures are gone — regenerate LESSONS.md so the repo artifact
    // doesn't retain fixture entries after the suite.
    spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'generate-lessons.mjs')], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  });

  test('F15_1: GET /api/insights returns the aggregate shape', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/insights`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totals.oneShots).toBe('number');
    expect(Array.isArray(body.models)).toBe(true);
    expect(Array.isArray(body.matrix)).toBe(true);
    expect(Array.isArray(body.lessons)).toBe(true);
  });

  test('F15_2: observations require id and attemptId', async () => {
    expect((await postObs({})).status).toBe(400);
    expect((await postObs({ id: 'json-repair' })).status).toBe(400);
  });

  test('F15_3: unknown one-shot / attempt return 404', async () => {
    expect(
      (await postObs({ id: 'does-not-exist-xyz', attemptId: 'att_x', lessons: ['l'] })).status
    ).toBe(404);
    mkOneShot('temp-obs-404', []);
    expect(
      (await postObs({ id: 'temp-obs-404', attemptId: 'att_missing', lessons: ['l'] })).status
    ).toBe(404);
  });

  test('F15_4: observations save once, then 409 on rewrite', async () => {
    mkOneShot('temp-obs-once', [
      {
        id: 'att_fixture_1',
        timestamp: '2026-07-01T00:00:00.000Z',
        model: 'fixture-model',
        environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
        build: { tokens: null, durationMs: null },
        evaluation: {
          method: 'none',
          fidelityScore: null,
          passed: null,
          feedback: '',
          evaluatedAt: null,
        },
      },
    ]);

    const first = await postObs({
      id: 'temp-obs-once',
      attemptId: 'att_fixture_1',
      wentWell: ['fixture went well'],
      lessons: ['fixture lesson text'],
    });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.observations.lessons[0]).toBe('fixture lesson text');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(oneShotsDir, 'temp-obs-once', 'oneshot.json'), 'utf8')
    );
    expect(manifest.attempts[0].observations.wentWell[0]).toBe('fixture went well');

    const second = await postObs({
      id: 'temp-obs-once',
      attemptId: 'att_fixture_1',
      lessons: ['attempted rewrite'],
    });
    expect(second.status).toBe(409);
    const reread = JSON.parse(
      fs.readFileSync(path.join(oneShotsDir, 'temp-obs-once', 'oneshot.json'), 'utf8')
    );
    expect(reread.attempts[0].observations.lessons[0]).toBe('fixture lesson text');
  });

  test('F15_5: invalid observation shapes return 400', async () => {
    mkOneShot('temp-obs-invalid', [
      {
        id: 'att_fixture_2',
        timestamp: '2026-07-01T00:00:00.000Z',
        model: 'fixture-model',
        environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
        build: { tokens: null, durationMs: null },
        evaluation: {
          method: 'none',
          fidelityScore: null,
          passed: null,
          feedback: '',
          evaluatedAt: null,
        },
      },
    ]);
    expect(
      (await postObs({ id: 'temp-obs-invalid', attemptId: 'att_fixture_2', lessons: 'not-a-list' }))
        .status
    ).toBe(400);
    expect(
      (await postObs({ id: 'temp-obs-invalid', attemptId: 'att_fixture_2', lessons: [] })).status
    ).toBe(400);
  });

  test('F15_6: an observation write regenerates LESSONS.md with the lesson', async () => {
    mkOneShot('temp-obs-lessons', [
      {
        id: 'att_fixture_3',
        timestamp: '2026-07-01T00:00:00.000Z',
        model: 'fixture-model',
        environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
        build: { tokens: null, durationMs: null },
        evaluation: {
          method: 'none',
          fidelityScore: null,
          passed: null,
          feedback: '',
          evaluatedAt: null,
        },
      },
    ]);
    const res = await postObs({
      id: 'temp-obs-lessons',
      attemptId: 'att_fixture_3',
      lessons: ['unique-e2e-lesson-marker-f15'],
    });
    expect(res.status).toBe(200);
    const md = fs.readFileSync(lessonsPath, 'utf8');
    expect(md.includes('unique-e2e-lesson-marker-f15')).toBe(true);
  });

  test('F15_7: insights reflect interaction + observations of a fixture attempt', async () => {
    mkOneShot('temp-obs-insights', [
      {
        id: 'att_fixture_4',
        timestamp: '2026-07-01T00:00:00.000Z',
        model: 'fixture-model-insights',
        environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
        build: { tokens: null, durationMs: null },
        interaction: { userPrompts: 1, oneShot: true, source: 'transcript' },
        observations: {
          wentWell: [],
          struggled: ['fixture struggle'],
          lessons: ['fixture insight lesson'],
          notedAt: '2026-07-01T00:00:00.000Z',
        },
        evaluation: {
          method: 'none',
          fidelityScore: null,
          passed: null,
          feedback: '',
          evaluatedAt: null,
        },
      },
    ]);
    const res = await fetch(`${DASHBOARD_URL}/api/insights`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const m = body.models.find((x) => x.model === 'fixture-model-insights');
    expect(m.oneShotRate).toBe(1);
    expect(m.topStruggles[0]).toBe('fixture struggle');
    const row = body.matrix.find((r) => r.oneShotId === 'temp-obs-insights');
    expect(row.cells['fixture-model-insights'].status).toBe('attempted');
    expect(row.cells['fixture-model-insights'].oneShot).toBe(true);
    const lesson = body.lessons.find((l) => l.text === 'fixture insight lesson');
    expect(lesson.oneShotId).toBe('temp-obs-insights');
  });
});
```

(If the runner does not provide `afterAll`, move the regeneration spawn into `afterEach` — check `tests/e2e/runner.js` for the supported hooks before finalizing.)

- [ ] **Step 2: Run the full e2e gate**

Run: `node tests/e2e/verify.js`
Expected: unit suites pass, dashboard builds, all cases including F15 pass, exit 0.

- [ ] **Step 3: Format + commit**

```bash
./dashboard/node_modules/.bin/prettier --write tests/e2e/cases/f15_insights.test.js
git add tests/e2e/cases/f15_insights.test.js
git commit -m "test(e2e): F15 gate for observations write-once + insights aggregate"
```

---

### Task 8: Docs — README mission reframe + AGENTS.md update

**Files:**

- Modify: `README.md` (intro, endpoints, recording section, contributing)
- Modify: `AGENTS.md` (remove R1 secrecy rule; renumber R2–R4 → R1–R3; builder prompt gains observations guidance)

- [ ] **Step 1: README**

(a) Replace the opening paragraph (line 6) with a two-goal mission:

```markdown
OneShotForge is a lab for measuring — and teaching — what AI coding tools can actually build in one shot. It houses independent, self-contained "one-shot" projects under `/one-shots/`, records every build attempt's **measurables** (model, tool, tokens, time, cost, prompt count) to disk from machine-observed evidence, and turns the results into lessons: which models one-shot which kinds of tasks, and where they struggle. Browse the current findings in [`LESSONS.md`](LESSONS.md) or run the dashboard in `/dashboard/`.
```

(b) After the architecture tree section, add a walkthrough section:

```markdown
## The learning loop

Every one-shot is an experiment. One pass through the loop:

1. **Pick an idea** from [`IDEAS.md`](IDEAS.md) and promote it: `python scripts/promote.py <ID>` (scaffolds the folder and seeds the vision), or write a new vision by hand.
2. **Build it** — paste the idea's ready-to-copy prompt into any AI coding tool (Claude Code, Codex, …) and let it work. 15 minutes or a day, doesn't matter.
3. **Record the attempt** with one command — telemetry is read from the tool's own session records, never typed by hand and never self-reported by the model:
   `node scripts/record-build.js --id <one-shot> --strategy single-prompt --lesson "what you learned"`
   This also machine-counts how many human prompts the build took, so "one-shot" is a measured fact, not a claim.
4. **Evaluate** in the dashboard: score fidelity against the immutable vision, run the acceptance test, and add observations — what went well, what the model struggled with.
5. **Learn** — the Insights tab and the generated [`LESSONS.md`](LESSONS.md) aggregate every attempt into per-model profiles and a one-shot × model scoreboard.
```

(c) In the REST endpoints list add (after the evaluation entry):

```markdown
- **`POST /api/manifest/observations`** `{ id, attemptId, wentWell?, struggled?, lessons? }`
  - Adds the qualitative teaching record to an attempt. Write-once: returns **409** if observations already exist.
- **`GET /api/insights`**
  - Cross-one-shot aggregate: per-model profiles, one-shot × model scoreboard, lessons feed. Quantitative averages include benchmark-eligible attempts only.
```

(d) In "Recording a build", document the new flags after the existing "Useful flags" sentence:

```markdown
Learning-layer flags: `--strategy <s>` tags how you prompted (`single-prompt`,
`plan-first`, …); `--went-well "..."`, `--struggled "..."`, and `--lesson "..."`
(each repeatable) record qualitative observations alongside the telemetry. The
number of human prompts is counted from the transcript automatically and stored
as `interaction.userPrompts` / `interaction.oneShot`.
```

(e) In the attempt JSON example, add after `"build": ...`:

```json
      "strategy": "single-prompt",
      "interaction": { "userPrompts": 1, "oneShot": true, "source": "transcript" },
      "observations": {
        "wentWell": ["Scaffolding compiled first try"],
        "struggled": ["Shader math needed corrections"],
        "lessons": ["This model one-shots WebGL scaffolding, not shader math"],
        "notedAt": "2026-06-17T01:00:00.000Z"
      },
```

(f) Note `LESSONS.md` in the architecture tree (one line: `├── LESSONS.md              # Generated teaching digest — what models can/can't one-shot`).

- [ ] **Step 2: AGENTS.md**

(a) Delete the entire `### R1. System Prompt Protection (Confidentiality)` section (heading + quote + line). Renumber `R2 → R1`, `R3 → R2`, `R4 → R3` (only AGENTS.md references these numbers — verified by grep).

(b) In the builder system prompt's section 3 (VISION & METRICS MANIFEST), extend the recording sentence to mention the learning flags: after the `record-build.js`/`record-evidence.js` guidance, add:

```text
When recording, pass what you observed qualitatively: --strategy <how it was prompted>, --went-well / --struggled / --lesson entries. Observations are write-once per attempt and feed the Insights tab and LESSONS.md.
```

- [ ] **Step 3: Verify docs match code**

Run: `node scripts/record-build.js --help` and compare flags to README text.
Run: `./dashboard/node_modules/.bin/prettier --check README.md AGENTS.md` (fix with `--write`).

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: reframe mission around the learning loop; drop secrecy rule"
```

---

### Task 9: Full verification

- [ ] **Step 1: Unit + e2e gates**

Run from repo root:

```bash
node tests/run-unit.js
node tests/e2e/verify.js
```

Expected: all suites pass, e2e exits 0.

- [ ] **Step 2: Lint + format gates (mirror CI)**

```bash
./dashboard/node_modules/.bin/prettier --check .
cd dashboard && npm run lint && cd ..
./dashboard/node_modules/.bin/eslint --ext .js scripts tests
```

Expected: all clean.

- [ ] **Step 3: Python tool suite untouched**

```bash
cd tools/llm-usage-reader && python -m pytest tests/ -q && cd ../..
```

Expected: pass (nothing in this plan touches the vendored tool).

- [ ] **Step 4: Manual smoke via preview**

Start the dashboard, open the Insights tab, confirm the scoreboard renders with the four real one-shots; open a Details modal, confirm the Observations form appears on an attempt without observations.

- [ ] **Step 5: Final commit if anything moved; branch is ready for PR**
