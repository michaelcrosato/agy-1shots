# Original User Request

## Initial Request — 2026-06-17T18:11:33Z

Build the OneShotForge Monorepo + Intelligent Dashboard v2.0. This repository serves as a permanent orchestrator for multiple independent "one-shot" scripts and apps.

Working directory: c:/dev/agy-1shots
Integrity mode: development

## Requirements

### R1. Root Monorepo Structure & Isolation

- Create the folder structure:
  - `/one-shots/` where individual artifacts live.
  - `/one-shots/<kebab-case-name>/` for each piece, containing the code, `README.md` (usage, one-click run commands, screenshots), `package.json`, test scripts, assets.
  - No shared code pollution unless in a versioned `/shared/` folder.

### R2. Intelligent Dashboard App

- Build a beautiful, responsive single-page web application in `/dashboard/` using Next.js 15 (App Router), shadcn/ui, and Tailwind CSS.
- The dashboard must:
  - Auto-scan the `/one-shots/` folder (or via a refresh button or API endpoint).
  - Display a searchable, filterable grid/table of all pieces (name, type, status, date, tags).
  - Let users click any item to preview the rendered `README.md` and metadata.
  - Provide action buttons for each piece: "Run/Test" (executes local script or opens preview), "Open Folder", "Polish", "Export as Standalone Repo".
  - Feature a sidebar with stats: total pieces, success rate, quick filters, dark mode toggle, and an "AI Suggest Improvement" button.

### R3. Example One-Shot Piece

- Build a sample one-shot piece under `/one-shots/notion-scraper/` that implements a Notion-connected web scraper.
- It should contain working code, its own `README.md` with run instructions, a `package.json`, and basic tests.

### R4. Project Documentation

- Create a comprehensive root `README.md` detailing the project architecture.
- Create `AGENTS.md` containing the Master One-Shot Builder System Prompt, Agent Rules/Constitution, and Optimal Workflow.

## Acceptance Criteria

### Dashboard Functionality

- [ ] Next.js dashboard compiles and runs locally via `npm run dev` in `/dashboard/`.
- [ ] The dashboard auto-scans the `/one-shots/` directory and lists the example piece.
- [ ] Search, filter, and README preview work without errors.

### Example Piece Functionality

- [ ] The Notion-scraper piece is runnable and contains a README.md and package.json.

### Documentation & Coding Standards

- [ ] Root README.md and AGENTS.md are written.
- [ ] All code compiles, runs, and is formatted cleanly.

## Follow-up — 2026-06-17T22:58:50Z

Build a structured Ideas Registry inside the OneShotForge monorepo and integrate it directly into the Next.js 15 dashboard UI, allowing users to view, search, and dynamically add new One-Shot ideas.

Working directory: c:/dev/agy-1shots
Integrity mode: development

## Requirements

### R1. Ideas Registry Storage
- Create a directory `/ideas/` containing:
  - `registry.json`: A structured database of all the One-Shot ideas listed below using a standardized intake schema.
  - `README.md`: A beautiful, auto-generated markdown document indexing all ideas by category, including metadata like Date Added, Tech Specs, Core Vision, and their standardized Task Prompts.

### R2. Dashboard Integration (Ideas Registry Page)
- Integrate a new "Ideas Registry" page/tab in the `/dashboard` application.
- The page must:
  - Display a clean grid or list of all ideas, grouped or filterable by category and target stack (e.g. Python, JS, Rust).
  - Show a detailed card/modal preview for any selected idea, rendering its full intake sheet (vision, tech specs, and ready-to-copy task prompt).
  - Include an "Add Idea" modal/form with validation that allows users to add new ideas (inputting title, category, vision, tech specs, target language, and prompt details).
  - Automatically write new ideas to `/ideas/registry.json` and sync/regenerate `/ideas/README.md` on submission.

### R3. API Endpoints
- Implement backend Next.js API endpoints to support these features:
  - `GET /api/ideas` — Returns the current list of ideas from `/ideas/registry.json`.
  - `POST /api/ideas` — Appends a new idea to `registry.json` (applying validation and security checks against directory traversal/prototype pollution), and regenerates `/ideas/README.md` automatically.

## Acceptance Criteria

### Data & Filesystem
- [ ] `/ideas/registry.json` and `/ideas/README.md` are initialized containing all ideas.
- [ ] The JSON file and markdown file compile to clean, valid JSON/Markdown.

### API Endpoints
- [ ] `GET /api/ideas` returns status 200 and the list of ideas.
- [ ] `POST /api/ideas` validates inputs, returns 200, saves to disk, and updates the markdown README.

### Dashboard UI
- [ ] Next.js dashboard compiles successfully with the new Ideas Registry view.
- [ ] Adding a new idea via the "Add Idea" form updates the UI list, saves to the JSON database, and regenerates the README file on disk.

---

## Source Material: List of One-Shot Ideas to Populate

### Automotive & B2B Lead Generation Tools
* **Dealership Intelligence Scraper, Harvester & Census Builder**: Generates a comprehensive, region-based or radius-bounded dealer census. Automatically queries the Google Maps Places API using a `place_id`-first architecture, extracting foundational details like name, address, phone, website, rating, and review count. It enriches rows via headless Playwright runs or Crawl4AI to scrape public sites for GM/GSM/Dealer Principal names, email contacts, social profiles, dealer management system (DMS) hints, and inventory sizes, outputting a deduplicated, ranked CSV or JSON file with supporting evidence URLs.
* **Lead Scoring, Qualification & Prioritization Engine**: Ingests raw dealership data or customer prospect CSV files containing source tracking, budget, vehicle interest, and purchase timelines. Employs a hybrid model utilizing weighted algorithmic rules for execution speed paired with LLM calls (Claude/GPT) to output a 1–10 "close probability" score, pain-point tags, qualitative prioritization commentary, and customized opening hooks.
* **ADF Lead Parser & CRM Webhook Auto-Enricher**: A FastAPI or Node.js gateway that accepts raw endpoint payloads, email data via IMAP polling, or Auto Dealer Format (ADF/XML) logs sent by third-party automotive portals. Normalizes phone, URL, address into JSON, flags anomalies, forwards to HubSpot/Pipedrive.
* **AI Cold Outreach Sequence Generator & Response Classifier**: Tailored outreach sequences (5-part email flow or scripts) for dealerships. Interactive UI classifies replies (Interested, Not Now, Hard No, Referral) and suggests immediate next-step actions.
* **Competitor Price Monitor, Inventory Auditor & OEM Incentive Bot**: Scans OEM press portals, competitor web inventory pages on cron. LLM-driven HTML text parsing (Firecrawl Markdown) to audit counts, drops, incentives, saving to local SQLite container and alerting via Slack.
* **Stale Dealership Lead Re-Engagement Detector**: Evaluates customer database records to calculate days elapsed. Cross-references opens/replies to flag leads in 14-60 day stagnate zone, drafting re-engagement SMS.

### AI Development, Prompting, Routing & Evaluation Tools
* **Multi-LLM Prompt A/B Tester & Side-by-Side Playground**: Single-file workspace (static HTML/Tailwind) that saves config to localStorage. Executes prompts simultaneously across Claude, GPT, Gemini, DeepSeek, MiniMax, showing column matrix of outputs, latency, tokens, cost.
* **Prompt Version Control, "Prompt Pack" Compiler & Library Manager**: Codifies prompts into version-controlled assets using CLI loop (`prompt push`, `prompt diff`) or Python + SQLite. Local semantic search via nomic-embed through Ollama, input/output definitions (Pydantic).
* **Model Cost-Arbitrage Router, Gateway Proxy & Budget Interceptor**: Async proxy (FastAPI/Go/LiteLLM-compatible) evaluating payload to route format tasks to low-cost Flash and reasoning tasks to frontier. Token rate limiting, budget kill-switch to prevent runaway agents, and credential masking.
* **LLM Prompt Regression Harness & Evaluation Framework**: Testing suite (pytest, Langfuse tracing) protecting against prompt regression. Evaluates JSONL test suite of golden/adversarial cases, using LLM-as-a-judge to render report.
* **Local LLM Benchmark Runner**: Python uv or async HTTP script commanding Ollama. Runs benchmark prompts from YAML to measure TTFT and tokens/sec, exporting a ranked local report.

### Agent Orchestration, Governance & Sandbox Frameworks
* **Agent App Starter Kit & Production Orchestration Boilerplate**: LangGraph/Pydantic AI/Mastra template with user auth, multi-container Docker, processing queues, custom retries, OpenTelemetry/Langfuse, human-in-the-loop rollback.
* **Model Context Protocol (MCP) Boilerplates, Custom Servers & Exposers**: Exposes tools (Swagger OpenAPI, Postgres schema, local log tailer, Linear/Jira syncing) using official SDKs.
* **MCP Server Hardening & Skill Supply-Chain Security Scanner**: Audits MCP implementations and automation scripts for OWASP LLM Top 10 vulnerabilities, prompt-injections, filesystem/shell command escapes, input parameters.
* **Strict Guardrails, `.cursorrules`, and `AGENTS.md` Code Generator**: Builds stack-specific structural rules (.cursorrules, CLAUDE.md, AGENTS.md, SKILL.md) enforcing Zero Placeholder, defensive commits, validation schemas.
* **Browser Workflow Recorder & Automation Sandbox**: Playwright/Browser Use script recorder capturing keyboard/mouse events in sandbox to emit scripts with page assertions and visual bounding-box constraints.
* **Small-Team Agent Control Center & Local Dashboards**: Self-hosted hub connecting Ollama/Open WebUI. Renders agent timeline, tracks token cost, context snapshots, and features a visual human gate to approve shell/file edits.
* **Persistent Context & Daily Agent Memory Cron Daemon**: Cron service parsing git changes, edits, calendar to write a structured MEMORY.md to update state across agent runs.
* **Agentic Task Decomposer**: HTML/JS helper parsing goal to technical 설계/rollout documents, designs, NOTES.md.
* **Voice-Enabled Task Agent Template**: STT/TTS hooks conversational interface driven by tool-calling model.
* **Vibe-to-Infra Architecture Generator**: Conversational infrastructure mapping (Docker Compose, Terraform).

### Codebase Engineering & Git Workflow Enhancers
* **Codebase Context Packer & Monorepo Collector**: Scans directory (honoring .gitignore) to pack codebase into a single Markdown file, ranking files by recency or import centrality.
* **Git-Aware Coding Agent & Automated Pull Request Tracker**: Agent/GitHub Action capturing issues, planning, editing in sandbox, running Semgrep/Bandit, and populating PR description from git diff.
* **Diff-to-Test Generator & Continuous Testing Loop Runner**: Watches file edits, parses diffs, writes Targeted vitest/pytest unit tests, and loops test execution until pass.
* **Smart Git Pre-Commit AI Reviewer**: Git hook piping staged diff to LLM API checking for syntax errors, regressions, credential leaks.
* **Threat Model Generator**: Architecture threat modeling using STRIDE/DREAD matrices, generating Mermaid flowcharts and OWASP checklists.
* **Sandbox Code Execution API**: FastAPI sandbox using gVisor/Firecracker to run code and capture outputs.
* **Visual Codebase Knowledge Graph & History Visualizer**: Node.js/Python tool parsing imports/commits to map dependencies and hotspots in D3.js or Plotly.

### Data, Document & Workspace Productivity Tools
* **Meeting-to-Execution & Audio Transcription Vault**: Offline Whisper.cpp transcription vault pulling action items, owners, Jira ticket mappings, follow-up emails.
* **B2B Research Brief & Competitor Analysis Generator**: Async domain scraper fetching domain specs, stack, and pricing via Tavily/Perplexity to build verified domain briefs.
* **Support Ticket Macro Factory & Automated Resolver**: Embedding vector clustering of ticket logs, drafting templates, validating fixes against mock data.
* **n8n Workflow Blueprint Creator & AI Automation Pack**: Generates importable n8n orchestration JSON scripts from natural language descriptions.
* **Contract, Policy & Document Diff Explainer**: Local PDF OCR contract reviewer highlighting cost increases, high-risk clauses, legal reviews.
* **Local Database Query Visualizer & Interactive Playground**: WebAssembly sql.js database visualizer with text-to-SQL querying and structured tutorials.
* **OpenAPI / Swagger Document Viewer**: 3-column Tailwind OpenAPI JSON/YAML parser with code copy-paste snippets (curl, js, python).
* **Developer REST API Mocking Studio**: GUI mapping REST routes, status codes, payload shapes, and delays to generate FastAPI/Express.js files.
* **Interactive Regex Playground**: Visual regex matcher showing capture groups and step-by-step state charts.
* **Custom Cron Job Visualizer**: Timeline generator detailing crontab intervals and plotting a 12-month calendar.

### Micro-SaaS Templates & Personal Workflow Apps
* **Micro-SaaS Authentication, Billing & Form Endpoint Scaffolding**: Auth + Stripe + Drizzle + static form-to-Google Sheets pipeline.
* **Personal Local Storage RAG & Bookmark Read-Later Dashboard**: Local PDF/bookmark aggregate with Ollama/SQLite semantic searches.
* **Resume / LinkedIn Fit Scorer & Tailor**: Job-fit resume matcher rewriting metric bullets to match posting.
* **Personal Expense Splitter & Ledger**: Mobile expense splits calculator optimizing minimal peer transactions.
* **Digital Asset Sizer & EXIF Metadata Scrubber**: Web EXIF stripper scaling image dimensions and outputting WebP/zip.
* **Personal Knowledge Graph & Mind-Mapper**: Mind-mapper mapping cross-linked entities with custom category tags.
* **Gamified Pomodoro & Habit Tracker RPG**: local Habit RPG syncing focus counts to local storage stats.
* **Markdown-to-Slide Deck Presentation Engine**: Split-pane Reveal.js slide compiler.
* **CSS Glassmorphism & SVG Blob Generator**: range slider graphical toolkit.
* **Invoice Automator**: Invoice parser exporting GST calculations directly to Quickbooks.
* **Family Photo Organizer**: Offline vision facial clustering app using Ollama.
* **Recipe-to-Instacart Cart Mapper**: recipe-to-shopping cart quantity mapper.
* **Offline Travel & Route Planner**: caches travel map layers for offline marine transit/hiking.

## Follow-up — 2026-06-17T23:14:53Z

Build enhanced backlog management, refactoring, and integration tools for the OneShotForge Ideas Registry. This includes a root-level IDEAS.md, prefix-based naming conventions, lifecycle tracking, promotion scripts to scaffold one-shots, and prompt generation utilities.

Working directory: c:/dev/agy-1shots
Integrity mode: development

## Requirements

### R1. Root IDEAS.md Backlog & ID Refactoring
- Refactor the 51 existing ideas in `/ideas/registry.json` and `/ideas/README.md` to use prefix-based ID conventions:
  - `AUTO-0XX` for Automotive & B2B Lead Generation Tools (e.g., AUTO-001 to AUTO-006)
  - `LLM-0XX` for AI Development, Prompting, Routing & Evaluation Tools (e.g., LLM-001 to LLM-005)
  - `AGENT-0XX` for Agent Orchestration, Governance & Sandbox Frameworks (e.g., AGENT-001 to AGENT-010)
  - `CODE-0XX` for Codebase Engineering & Git Workflow Enhancers (e.g., CODE-001 to CODE-007)
  - `DATA-0XX` for Data, Document & Workspace Productivity Tools (e.g., DATA-001 to DATA-010)
  - `MICRO-0XX` for Micro-SaaS Templates & Personal Workflow Apps (e.g., MICRO-001 to MICRO-013)
- Create a beautiful, comprehensive `IDEAS.md` file at the repository root, presenting all 51 ideas in a structured, readable backlog using the prefix IDs and category tables.
- Add lifecycle fields to each idea's metadata in `/ideas/registry.json`:
  - `status`: `"backlog"` (default), `"promoted"`, or `"archived"`. Set `status` for the Notion Scraper idea to `"promoted"`.
  - `promoted_to`: `"notion-scraper"` for the Notion Scraper idea, `null` otherwise.
  - `supersedes`: `null` (or ID of any superseded idea).

### R2. Scaffolding Promotion CLI (`scripts/promote.py`)
- Create a Python script `/scripts/promote.py` that automates promoting an idea from the backlog to a benchmark one-shot.
- The script should:
  - Take a prefix-based ID (e.g., `AUTO-001` or `notion-scraper`'s ID) as a parameter.
  - Find the idea in `/ideas/registry.json`.
  - Scaffold a new directory `/one-shots/<kebab-case-slug>/`.
  - Initialize the directory with a compliant `oneshot.json` (seeding version, vision,createdAt, and first empty attempt), a basic `package.json`, a placeholder source file, a testing script, and a local `README.md` using the idea's specifications.
  - Update the idea's status to `"promoted"` and set `promoted_to` to the newly created directory name in `/ideas/registry.json` (and automatically regenerate `/ideas/README.md` and root `IDEAS.md`).

### R3. Variable-Substituting Prompt Generator (`scripts/prompt-gen.py`)
- Create a Python script `/scripts/prompt-gen.py` to compile and substitute variables in task prompts.
- The script should:
  - Take an idea ID (e.g., `AUTO-001`) as a parameter.
  - Accept optional variable overrides via CLI arguments (e.g., `--language python --framework playwright`).
  - Retrieve the idea's standardized prompt, substitute template variables (like `{{LANGUAGE}}`, `{{FRAMEWORK}}`), and print the final prompt.
  - Optionally copy the compiled prompt directly to the clipboard (using standard library or lightweight modules).

### R4. Dashboard UI & API Integration
- Update the `/api/ideas` GET and POST route handlers in `dashboard/app/api/ideas/route.js` and the mock E2E server in `tests/e2e/verify.js` to handle the new prefix-based IDs and lifecycle metadata (`status`, `promoted_to`, `supersedes`).
- Modify the POST route so that new ideas submitted via the dashboard are automatically assigned the next sequential ID for their category (e.g. `AUTO-007` if there are 6 existing `AUTO` ideas) and default to `status: "backlog"`.
- Update the Next.js dashboard UI (`dashboard/app/DashboardClient.jsx`) to display the prefix IDs, lifecycle statuses, and allow filtering or highlighting of ideas based on their promotion status.

## Acceptance Criteria

### Data & Scaffolding
- [ ] `/ideas/registry.json`, `/ideas/README.md`, and root `IDEAS.md` all exist, are well-formed, and use prefix IDs (e.g. `AUTO-001`).
- [ ] notion-scraper has its status set to `"promoted"` and `promoted_to` set to `"notion-scraper"`.

### CLI Scripts
- [ ] `/scripts/promote.py` runs successfully, creating the `/one-shots/` scaffold and updating the idea's status in `registry.json`.
- [ ] `/scripts/prompt-gen.py` runs successfully, printing a substituted prompt with variables replaced.

### API & UI
- [ ] GET `/api/ideas` returns prefix IDs and lifecycle metadata.
- [ ] POST `/api/ideas` generates the correct sequential prefix ID and saves status/metadata fields.
- [ ] Dashboard UI compiles and displays prefix IDs and statuses.
- [ ] Running E2E verification test suite (`node tests/e2e/verify.js`) passes successfully.

