# Project: OneShotForge Ideas Registry Integration

This repository indexes, scaffolds, and displays One-Shot ideas for standalone utilities, bots, and Micro-SaaS tools.

## Architecture & Code Layout

- `/ideas/`:
  - `registry.json`: Schema-validated database storing all ideas.
  - `README.md`: Auto-generated catalog indexing ideas by category.
- `/one-shots/`: Individual scaffolded project directories.
- `/scripts/`:
  - `promote.py`: Python CLI tool to scaffold an idea into `/one-shots/` and update registry status.
  - `prompt-gen.py`: Python CLI tool to perform template variable substitution in task prompts.
- `/dashboard/`:
  - `app/api/ideas/route.js`: Next.js NextResponse API endpoint handlers.
  - `app/DashboardClient.jsx`: Next.js main web dashboard client page.
- `/tests/`:
  - `e2e/verify.js`: Verification server and test runner orchestrator.
- `/IDEAS.md`: Root-level backlog summary.

## Interface Contracts

### Ideas Registry Schema

```json
{
  "id": "AUTO-001",
  "title": "Dealership Intelligence Scraper, Harvester & Census Builder",
  "category": "Automotive & B2B Lead Generation Tools",
  "vision": "...",
  "techSpecs": "...",
  "targetStack": "...",
  "readyToCopyTaskPrompt": "...",
  "dateAdded": "2026-06-17",
  "status": "backlog" | "promoted" | "archived",
  "promoted_to": "notion-scraper" | null,
  "supersedes": null | string
}
```

### Next.js API Endpoints

- **GET `/api/ideas`**: Returns JSON array of all ideas matching the schema.
- **POST `/api/ideas`**: Ingests new idea, assigns next sequential ID, sets status to `backlog`, updates registry, and auto-regenerates `/ideas/README.md` and `/IDEAS.md`.

### CLI Interface

- `python scripts/promote.py <ID>`: Scaffolds a new one-shot project under `/one-shots/<slug>/` and marks the idea as promoted.
- `python scripts/prompt-gen.py <ID> [--language LANG] [--framework FW]`: Prints variable-substituted prompts.
