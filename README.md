# OneShotForge Monorepo & Intelligent Dashboard v2.0

OneShotForge is a developer-focused monorepo designed to house independent, self-contained "one-shot" scripts and applications under `/one-shots/`, and manage them via an intelligent, single-page dashboard application built in `/dashboard/`.

---

## Repository Architecture

This repository is organized as a monorepo with strict isolation between components:

```text
/ (root)
├── README.md               # Monorepo architecture & setup (this file)
├── AGENTS.md               # Agent guidelines, system prompt, and workflows
├── dashboard/              # Next.js 15 App Router dashboard application
│   ├── package.json        # Dashboard-specific dependencies
│   ├── src/
│   │   ├── app/            # App router pages, layouts, and API routes (/api/scan, /api/run)
│   │   └── components/     # UI components styled with Tailwind CSS and shadcn/ui
│   └── ...
├── one-shots/              # Directory containing isolated one-shot pieces
│   └── notion-scraper/     # Example web scraper connected to Notion
│       ├── README.md       # Usage and one-click run instructions
│       ├── package.json    # Metadata, dependencies, and test/start scripts
│       ├── index.js        # Main execution entrypoint
│       └── tests/          # Local unit/integration tests
└── shared/                 # Optional folder for versioned common code/configurations
```

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
  - Returns: `JSON` array of pieces:
    ```json
    [
      {
        "name": "notion-scraper",
        "version": "1.0.0",
        "description": "Notion-connected web scraper",
        "tags": ["scraper", "notion"],
        "path": "one-shots/notion-scraper",
        "readme": "..."
      }
    ]
    ```
- **`POST /api/run`**
  - Executes the target piece (either the run script or its test script).
  - Body:
    ```json
    {
      "name": "notion-scraper",
      "action": "run"
    }
    ```
  - Returns: Real-time console logs or success status.
- **`GET /api/scan/:id/manifest`**
  - Returns the full `oneshot.json` (vision + attempt history), or a normalized empty default when none exists.
- **`POST /api/manifest/spec`** `{ id, vision, acceptance? }`
  - Creates the immutable vision. Write-once: returns **409** if a vision already exists.
- **`POST /api/manifest/attempt`** `{ id, model?, environment?, build?, runtime? }`
  - Appends a build attempt to the append-only history.
- **`POST /api/manifest/evaluation`** `{ id, attemptId, fidelityScore?, feedback? }`
  - Records a human fidelity evaluation for an existing attempt.
- **`POST /api/manifest/verify`** `{ id, attemptId? }`
  - Runs the one-shot's `verify` acceptance test and records the objective pass/fail.

---

## Vision & Metrics

Each one-shot can carry a `oneshot.json` that turns it into a longitudinal benchmark — letting you measure whether better tools, models, prompting, and planning make you faster, cheaper, and more consistent over time.

- **`spec` (write-once, never deleted)** — the `vision` (what success looks like) that every attempt is scored against, plus how to evaluate it (`acceptance.mode`: `human` or `program`).
- **`attempts[]` (append-only)** — one entry per build/regeneration, capturing the generation cost (`build.tokens` / `build.durationMs`), the runtime cost (`runtime.*`), the `model`, the `environment` (tool build + OS build), and an `evaluation` (a `fidelityScore` 0–100 for human review, or `passed` for an automated `verify` test).

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
      "environment": { "tool": "Antigravity", "toolBuild": "xxxx", "os": "Windows 11", "osBuild": "xxxx" },
      "build": { "tokens": 123456, "durationMs": 845000 },
      "runtime": { "tokens": 0, "durationMs": 1200 },
      "evaluation": { "method": "human", "fidelityScore": 87, "passed": null, "feedback": "Mostly matched the vision.", "evaluatedAt": "2026-06-17T01:00:00.000Z" }
    }
  ]
}
```

Open a one-shot's **Details** in the dashboard to read the vision, see the attempt history and trend lines, record a new attempt, and run/score the acceptance test. The vision and prior attempts are never overwritten — only appended to.

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
4. Add a `oneshot.json` with the `spec.vision` and a seed entry in `attempts[]` (see [Vision & Metrics](#vision--metrics)). For non-visual outputs, add a `scripts.verify` acceptance test and set `acceptance.mode` to `program`.
5. Verify your piece appears in the Dashboard and passes local tests before submitting a PR.
