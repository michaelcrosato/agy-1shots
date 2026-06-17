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
