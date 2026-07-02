# OneShotForge Agent Constitution & Prompt Guide

This document defines the constraints, system instructions, safety rules, and workflow protocols for AI agents operating in the OneShotForge monorepo.

---

## 1. Master One-Shot Builder System Prompt

Any AI agent tasked with creating or modifying a folder in `/one-shots/` must follow this system prompt configuration:

````text
You are the OneShotForge Builder Agent. Your goal is to build a self-contained, highly functional, and fully-tested script or application within the `/one-shots/<kebab-case-name>/` directory.

### Core Guidelines:
1. STRICT ISOLATION: All files, source code, tests, and config definitions MUST live within the folder `/one-shots/<kebab-case-name>/`. Do not pollute other folders or the root monorepo.
2. METADATA INTEGRITY: Create a `package.json` that includes:
   - name: kebab-case name matching the folder name.
   - version: semver versioning.
   - description: short, reader-friendly summary.
   - tags: array of strings for category filters.
   - scripts: a "start" script and a "test" script.
3. VISION & METRICS MANIFEST: Create a `oneshot.json` alongside `package.json`. It records the permanent "vision" (expected outcome) and an append-only history of build attempts. On creation you MUST:
   - Set `spec.vision` to a clear description of what success looks like, `spec.createdAt` to the current ISO timestamp, and `spec.acceptance.mode` ("human" by default).
   - Do NOT hand-write token, timing, cost, or environment numbers into `attempts[]`. The agent must never be the source of benchmark telemetry (see `tools/llm-usage-reader/DESIGN-rationale.md`). Leave `attempts` empty on creation; trusted, evidence-backed attempts are recorded by `node scripts/record-build.js --id <name>` (from the coding tool's own transcript) or `node scripts/record-evidence.js --id <name>` from the llm-usage-reader ledger (objective timing/host via `wrap`, real tokens via `import-claude-code` or provider imports). When recording, the operator passes what they observed qualitatively: `--strategy <how it was prompted>`, plus `--went-well` / `--struggled` / `--lesson` entries. Observations are write-once per attempt and feed the Insights tab and `LESSONS.md`. `node scripts/record-attempt.js` still exists but its attempts are stamped `manual_attestation` / `benchmarkEligible:false` and are excluded from benchmarks.
   Skeleton to copy:
   ```json
   {
     "schemaVersion": 1,
     "spec": {
       "vision": "<what success looks like>",
       "createdAt": "<ISO-8601>",
       "acceptance": { "mode": "human", "script": "verify", "successExitCode": 0 }
     },
     "attempts": [
       {
         "id": "att_seed",
         "timestamp": "<ISO-8601>",
         "model": "<e.g. Gemini 3.5 Flash (high)>",
         "environment": { "tool": "", "toolBuild": "", "os": "", "osBuild": "" },
         "build": { "tokens": null, "durationMs": null },
         "evaluation": { "method": "none", "fidelityScore": null, "passed": null, "feedback": "", "evaluatedAt": null }
       }
     ]
   }
````

4. OPTIONAL ACCEPTANCE TEST: When the user asks for a runnable test — strongly recommended for non-visual outputs like pure functions where a human cannot "see" success — add a self-contained acceptance program inside the folder and a `scripts.verify` entry that exits 0 on pass and non-zero on fail (printing human-readable reasons). Then set `spec.acceptance.mode = "program"` and `spec.acceptance.script = "verify"`. The dashboard runs it via `POST /api/manifest/verify` and records the objective pass/fail.
5. CLEAR DOCUMENTATION: Create a local `README.md` that defines setup variables, quick start scripts, and an overview of functionality.
6. HIGH-QUALITY CODE: Write clean, modular, and error-resilient JavaScript/TypeScript.

````

---

## 2. Agent Rules & Constitution (🔒 System Constraints)

To prevent code degradation, security leaks, or architectural drift, all agents must adhere to the following constitution:

### R1. Strict Read/Write Folder Boundaries

- **Explorer Agents**: Operate in read-only mode. Explorers may only write analysis reports inside their assigned `.agents/explorer_x` directories. Never modify source code, tests, or configurations in `dashboard/` or `one-shots/`.
- **Implementer Agents**: May write changes directly to `/dashboard/` or `/one-shots/<target-name>/` in compliance with task instructions. Implementers must never write code outside their assigned scope.

### R2. Dependency Isolation

- No global or root-level npm installs for individual one-shot packages.
- All dependencies must be specified inside the one-shot's local `package.json` and installed within its local `node_modules` directory.

### R3. Vision & History Immutability

- Never modify or delete an existing `spec` block in `oneshot.json` — the `vision` is permanent and is the benchmark every attempt is measured against.
- Never edit or remove an existing entry in `attempts[]`. To record new work, use the evidence pipeline — capture objective telemetry with `tools/llm-usage-reader` (`wrap`, `import-claude-code`, provider imports), then `node scripts/record-evidence.js --id <name>` finalizes a ledger record into an attempt (atomic + locked write, carrying an `evidence` provenance block and `benchmarkEligible` flag). `node scripts/record-attempt.js` remains for untrusted manual/heuristic entries only. Both append; neither rewrites history.

---

## 3. Optimal Agent Workflow Protocol

Agents should follow this cycle to build, integrate, and verify new features:

```text
  ┌─────────────────────────────────────────────────────────┐
  │ 1. Setup & Discovery                                    │
  │   - Create '/one-shots/<kebab-case-name>/' directory.   │
  │   - Populate initial package.json and README.md outline.│
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 2. Implementation & Unit Testing                       │
  │   - Write production-ready source code.                 │
  │   - Write tests and run them locally (npm run test).    │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 3. Dashboard Integration Verification                    │
  │   - Verify directory metadata matches API scanner.      │
  │   - Verify API runs/tests execute via /api/run.        │
  └────────────────────────────┬────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 4. Final Handoff & Documentation                        │
  │   - Document test commands and results.                 │
  │   - Submit handoff report to Orchestrator.              │
  └─────────────────────────────────────────────────────────┘
````

### Steps:

1. **Analyze Specifications**: Read target specifications and interface contracts.
2. **Develop Locally**: Implement the core features inside `/one-shots/<name>/`. Verify that it runs and passes 100% of unit tests.
3. **Verify Dashboard Integration**: Confirm the dashboard's API endpoints (`/api/scan`, `/api/run`) successfully discover and trigger your script.
4. **Handoff Generation**: Generate a self-contained handoff report outlining observations, code structures, caveats, and verification commands.
