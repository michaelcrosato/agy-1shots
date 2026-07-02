# OneShotForge Monorepo & Intelligent Dashboard (Alpha v0.01)

> [!NOTE]
> This project is currently in **Alpha (v0.01)**. Features, specifications, and architecture are under active development.

OneShotForge is a lab for measuring — and teaching — what AI coding tools can actually build in one shot. It houses independent, self-contained "one-shot" projects under `/one-shots/`, records every build attempt's **measurables** (model, tool, tokens, time, cost, prompt count) to disk from machine-observed evidence, and turns the results into lessons: which models one-shot which kinds of tasks, and where they struggle. Browse the current findings in [`LESSONS.md`](LESSONS.md) or run the dashboard in `/dashboard/`.

---

## Repository Architecture

This repository is organized as a monorepo with strict isolation between components:

```text
/ (root)
├── README.md               # Monorepo architecture & setup (this file)
├── LESSONS.md              # Generated teaching digest — what models can/can't one-shot
├── AGENTS.md               # Agent guidelines, system prompt, and workflows
├── dashboard/              # Next.js 15 App Router dashboard application
│   ├── app/                # Routes, layouts, pages, and API routes
│   │   ├── api/            # Backend route handlers (scan, run, manifest, ideas, …)
│   │   ├── page.jsx        # Dashboard UI (Tailwind CSS)
│   │   └── DashboardClient.jsx
│   ├── lib/                # Server logic: manifest, pricing, exec, stats, atomic-file
│   └── package.json        # Dashboard-specific dependencies
├── one-shots/              # Isolated, self-contained one-shot pieces
│   └── notion-scraper/     # Example web scraper connected to Notion
│       ├── README.md       # Usage and one-click run instructions
│       ├── package.json    # Metadata, dependencies, and test/start scripts
│       └── index.js        # Main execution entrypoint
├── scripts/                # CLI tools: record-build/evidence/attempt.js, promote.py, prompt-gen.py
├── ideas/                  # One-shot ideas registry (registry.json + generated README)
├── tools/                  # Vendored tooling (llm-usage-reader — the evidence recorder)
└── tests/                  # Unit suites + the e2e gate (tests/e2e/)
```

### The learning loop

Every one-shot is an experiment. One pass through the loop:

1. **Pick an idea** from [`IDEAS.md`](IDEAS.md) and promote it: `python scripts/promote.py <ID>` (scaffolds the folder and seeds the vision), or write a new vision by hand.
2. **Build it** — paste the idea's ready-to-copy prompt into any AI coding tool (Claude Code, Codex, …) and let it work. 15 minutes or a day, doesn't matter.
3. **Record the attempt** with one command — telemetry is read from the tool's own session records, never typed by hand and never self-reported by the model:
   `node scripts/record-build.js --id <one-shot> --strategy single-prompt --lesson "what you learned"`
   This also machine-counts how many human prompts the build took, so "one-shot" is a measured fact, not a claim.
4. **Evaluate** in the dashboard: score fidelity against the immutable vision, run the acceptance test, and add observations — what went well, what the model struggled with.
5. **Learn** — the Insights tab and the generated [`LESSONS.md`](LESSONS.md) aggregate every attempt into per-model profiles and a one-shot × model scoreboard.

### Core Architecture Principles

1. **Zero Polluting Shared State**: Each folder under `/one-shots/<kebab-case-name>/` must be fully self-contained. It must not share database states, config variables, or local modules with other one-shots.
2. **Minimal Root Footprint**: The root directory maintains minimal dependencies. Dependencies are managed locally in `/dashboard/package.json` and `/one-shots/<name>/package.json`.
3. **Dashboard Discovery Engine**: The dashboard application programmatically scans the subfolders of `/one-shots/` to display, preview, and run tasks.

---

## Interface Contracts (Dashboard ↔ One-Shots)

To integrate seamlessly with the Dashboard, every folder in `/one-shots/` must implement the following contract:

### 1. File Requirements

- **`package.json`**: Must contain the following fields:
  - `name`: (string) kebab-case name of the one-shot.
  - `version`: (string) version number (e.g. `1.0.0`).
  - `description`: (string) a concise description displayed in the dashboard card.
  - `tags`: (array of strings) tags for filtering (e.g. `["scraper", "notion", "backend"]`).
  - `scripts`: Must define:
    - `start`: Command to run the piece (e.g. `node index.js`).
    - `test`: Command to run tests (e.g. `jest` or `node --test`).
    - `verify` _(optional)_: A runnable acceptance test that exits `0` on pass / non-zero on fail. Used by the dashboard to objectively score "how close did we get to the vision?" for non-visual outputs.
- **`README.md`**: Detailed instructions, setup variables, run scripts, and expected outputs.
- **`oneshot.json`** _(recommended)_: The vision + metrics manifest (see [Vision & Metrics](#vision--metrics)).

### 2. REST API Endpoints (Dashboard Backend)

- **`GET /api/scan`**
  - Scans `/one-shots/` for subdirectories containing a valid `package.json`.
  - Returns: `JSON` array of pieces, each with a `manifest` benchmark summary
    (a normalized empty summary when no `oneshot.json` exists):
    ```json
    [
      {
        "id": "notion-scraper",
        "name": "notion-scraper",
        "version": "1.0.0",
        "description": "Notion-connected web scraper",
        "tags": ["scraper", "notion"],
        "path": "one-shots/notion-scraper",
        "manifest": {
          "hasManifest": true,
          "hasVision": true,
          "attemptCount": 3,
          "benchmarkEligibleCount": 2,
          "latestEvidenceLevel": "vendor_session_store",
          "latestModel": "claude-opus-4-8"
        }
      }
    ]
    ```
- **`POST /api/run`**
  - Executes the target piece (either the run script or its test script).
  - Body:
    ```json
    {
      "id": "notion-scraper",
      "action": "start"
    }
    ```
  - Returns: captured stdout/stderr, exit code, and a success flag.
- **`GET /api/scan/:id/manifest`**
  - Returns the full `oneshot.json` (vision + attempt history), or a normalized empty default when none exists.
- **`POST /api/manifest/spec`** `{ id, vision, acceptance? }`
  - Creates the immutable vision. Write-once: returns **409** if a vision already exists.
- **`POST /api/manifest/attempt`** `{ id, model?, environment?, build? }`
  - Appends a build attempt to the append-only history.
- **`POST /api/manifest/evaluation`** `{ id, attemptId, fidelityScore?, feedback? }`
  - Records a human fidelity evaluation for an existing attempt.
- **`POST /api/manifest/observations`** `{ id, attemptId, wentWell?, struggled?, lessons? }`
  - Adds the qualitative teaching record to an attempt. Write-once: returns **409** if observations already exist.
- **`GET /api/insights`**
  - Cross-one-shot aggregate: per-model profiles, one-shot × model scoreboard, lessons feed. Quantitative averages include benchmark-eligible attempts only.
- **`POST /api/manifest/verify`** `{ id, attemptId? }`
  - Runs the one-shot's `verify` acceptance test and records the objective pass/fail.

---

## Vision & Metrics

Each one-shot can carry a `oneshot.json` that turns it into a longitudinal benchmark — letting you measure whether better tools, models, prompting, and planning make you faster, cheaper, and more consistent over time.

- **`spec` (write-once, never deleted)** — the `vision` (what success looks like) that every attempt is scored against, plus how to evaluate it (`acceptance.mode`: `human` or `program`).
- **`attempts[]` (append-only)** — one entry per build/regeneration, capturing the generation cost (`build.tokens` / `build.durationMs`), the `model`, the `environment` (tool build + OS build), and an `evaluation` (a `fidelityScore` 0–100 for human review, or `passed` for an automated `verify` test).

```json
{
  "schemaVersion": 1,
  "spec": {
    "vision": "What success looks like.",
    "createdAt": "2026-06-17T00:00:00.000Z",
    "acceptance": { "mode": "human", "script": "verify", "successExitCode": 0 }
  },
  "attempts": [
    {
      "id": "att_1750000000000_abc123",
      "timestamp": "2026-06-17T00:00:00.000Z",
      "model": "Gemini 3.5 Flash (high)",
      "environment": {
        "tool": "Antigravity",
        "toolBuild": "xxxx",
        "os": "Windows 11",
        "osBuild": "xxxx"
      },
      "build": { "tokens": 123456, "durationMs": 845000 },
      "strategy": "single-prompt",
      "interaction": { "userPrompts": 1, "oneShot": true, "source": "transcript" },
      "observations": {
        "wentWell": ["Scaffolding compiled first try"],
        "struggled": ["Shader math needed corrections"],
        "lessons": ["This model one-shots WebGL scaffolding, not shader math"],
        "notedAt": "2026-06-17T01:00:00.000Z"
      },
      "evaluation": {
        "method": "human",
        "fidelityScore": 87,
        "passed": null,
        "feedback": "Mostly matched the vision.",
        "evaluatedAt": "2026-06-17T01:00:00.000Z"
      }
    }
  ]
}
```

Open a one-shot's **Details** in the dashboard to read the vision, see the attempt history and trend lines, record a new attempt, and run/score the acceptance test. The vision and prior attempts are never overwritten — only appended to.

---

## Evidence-backed benchmarking

A benchmark is only as good as its measurements. Per the design review in
[`tools/llm-usage-reader/DESIGN-rationale.md`](tools/llm-usage-reader/DESIGN-rationale.md),
**the model must never be the source of benchmark telemetry.** OneShotForge
therefore records attempt telemetry from objective evidence, not self-report:

- **`tools/llm-usage-reader/`** — a vendored, dependency-free recorder. It captures
  machine-observed timing/host (`wrap`), real token usage from Claude Code session
  transcripts (`import-claude-code`) and provider usage/cost exports, into a
  hash-verified append-only ledger with a `verify` integrity gate.
- **`scripts/record-evidence.js`** — finalizes a ledger record into an attempt with
  an `evidence` block (`evidenceLevel`, `tokensSource`, ledger record id + hash),
  observed usage kept **separate** from billing, and a `benchmarkEligible` flag.
- **Evidence levels** (strongest → weakest): `provider_reconciled`,
  `native_telemetry`, `vendor_session_store`, `system_probe` (timing only),
  `manual_attestation`, `legacy_self_reported`, `unavailable`. Only trusted,
  _measured_ token evidence is `benchmarkEligible`; manual, legacy, and
  timing-only attempts are recorded but excluded from benchmark comparisons.
  Attempts without an `evidence` block are classified `legacy_self_reported`
  (computed at read time — historical records are never mutated).

The dashboard shows each attempt's evidence badge and a benchmark-eligible count,
so professionals can compare models on a one-shot using only trustworthy data.
The example one-shots [`token-cost-estimator`](one-shots/token-cost-estimator/) and
[`json-repair`](one-shots/json-repair/) are small, program-verifiable tasks — good
for **playtesting** what a model can one-shot and for accumulating objective,
comparable benchmark history across models.

---

## Recording a build

When a coding tool finishes building a one-shot, record the attempt to the
dashboard with **one command** — you never type telemetry numbers by hand.

**Primary — `record-build.js` (auto, from the coding tool's own transcript):**

```bash
node scripts/record-build.js --id <one-shot>
```

Run it from the same directory you ran the coding tool in (normally the repo
root), right after the build finishes. It reads the tool's session transcript
and appends **one** evidence-backed attempt with everything filled in
automatically:

- **what model** — the model the tool actually used
- **the setting** — effort / speed (e.g. `standard` / `fast`)
- **the tool + build** — e.g. `claude-code 2.1.181`
- **the OS + build** — e.g. `Windows 10.0.26200`
- **build tokens** — summed from the real session usage
- **build time** — wall-clock span of the build session

Useful flags: `--dry-run` previews the attempt without writing; `--effort high`
tags a setting the transcript doesn't carry; `--transcript <file.jsonl>` or
`--projects-dir <dir>` point at the session explicitly when you ran the tool
from a different directory. The auto-reader currently understands Claude Code
and Codex transcripts.

Learning-layer flags: `--strategy <s>` tags how you prompted (`single-prompt`,
`plan-first`, …); `--went-well "..."`, `--struggled "..."`, and `--lesson "..."`
(each repeatable) record qualitative observations alongside the telemetry. The
number of human prompts is counted from the transcript automatically and stored
as `interaction.userPrompts` / `interaction.oneShot`.

**Ledger path — `record-evidence.js` (from the llm-usage-reader ledger):**

```bash
node scripts/record-evidence.js --id <one-shot> --latest
```

Finalizes a record captured by the vendored [`tools/llm-usage-reader`](tools/llm-usage-reader/)
(`wrap` for timing/host, `import-claude-code` or provider usage/cost exports for
tokens) into an attempt with its `evidence` provenance block and
`benchmarkEligible` flag. Use this when your token evidence comes from a
provider usage export rather than a local transcript.

> [!WARNING] > `node scripts/record-attempt.js` still exists but its attempts are stamped
> `manual_attestation` / `benchmarkEligible: false` and are **excluded from
> benchmark comparisons**. Don't use it for data you want to compare — reach for
> one of the evidence-backed recorders above.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or later
- **npm** or **pnpm**

### Installation

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd agy-1shots
   ```

2. Set up and run the Dashboard:

   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

   The dashboard will be available at `http://localhost:3000`.

3. Running a One-Shot Piece manually:
   ```bash
   cd one-shots/notion-scraper
   npm install
   npm start
   ```

---

## Contributing / Adding a One-Shot

1. Create a subdirectory under `/one-shots/` using kebab-case (e.g. `/one-shots/my-awesome-script/`).
2. Add a `package.json` with the required metadata fields (`name`, `description`, `version`, `tags`) and execution scripts (`start`, `test`).
3. Add a `README.md` documenting usage, required environment variables, and visual previews/examples.
4. Add a `oneshot.json` with the `spec.vision` and seed the first attempt. (Note: when promoting an idea, run `python scripts/promote.py <ID>` to scaffold the files and seed the manifest automatically. To record subsequent attempts, use the evidence-backed recorders in [Recording a build](#recording-a-build) — `node scripts/record-build.js --id <id>` after a build — never the deprecated `record-attempt.js`, whose entries are not benchmark-eligible.) For non-visual outputs, add a `scripts.verify` acceptance test and set `acceptance.mode` to `program`.
5. Verify your piece appears in the Dashboard and passes local tests before submitting a PR.
