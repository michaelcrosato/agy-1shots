# Security & Trust Model

OneShotForge is a **single-user, localhost-only developer tool**. This document
states its trust model explicitly so the assumptions behind the code are
auditable — and so it is clear what would have to change before running it in any
other setting.

## Trust model

- OneShotForge runs on the **operator's own machine** and is served on
  **`http://localhost:3000` (loopback only)**. There is **no authentication** by
  design.
- One-shots are **operator-authored** and committed under `one-shots/`. They are
  created locally (a one-shot subdirectory, or the local idea-promotion
  scaffolder). There is **no upload, import-from-URL, or external-submission
  path**.
- A one-shot's `package.json` scripts are therefore **trusted, operator-authored
  code** — the same trust posture as `npm run`, `make`, or `just`.

## What runs, and with what privileges

`POST /api/run` and `POST /api/manifest/verify` execute the one-shot's own
`package.json` scripts via `child_process.exec`, **in a real shell, with the
operator's full OS-user privileges** (filesystem, environment, credentials).
**This is the intended core feature, not a flaw** — it is how a local
task/script runner works.

## What the in-process guards ARE (and are NOT)

`dashboard/lib/exec.js` has best-effort safety rails: `detectCommandEscape()`
blocks accidental path-traversal / absolute-path escapes in a command and its
args, `sanitizeEnv()` drops dangerous keys from any caller-supplied `env`, runs
are serialized per one-shot, and a 30-second timeout is enforced.

These are **safety rails against a malformed or buggy one-shot you wrote** — not
a security sandbox. A script that *wants* to run arbitrary code can trivially do
so (it is already a shell command, with `$()`, backticks, env expansion,
redirection, `node -e`, and so on). The guards assume the command source is
**trusted**; they protect you from mistakes, not from an attacker.

> **Do not run one-shots you did not author or review.** Treat a one-shot's
> scripts exactly as you would an unknown `make` / `npm` project.

## Network exposure

The `dev` and `start` scripts bind **loopback (`127.0.0.1`) only**. Do **not**
bind the server to `0.0.0.0` or place it behind a tunnel/reverse proxy: the
code-executing routes are unauthenticated, so exposing the port would hand
**arbitrary code execution to anyone who can reach it**.

## When real sandboxing becomes REQUIRED

If the threat model ever changes — running **untrusted / third-party** one-shots,
accepting one-shots via **upload/import**, or exposing the dashboard to **more
than the single local operator** — then in-process command filtering is **not**
sufficient. You must add:

- **OS-level isolation** per run (container / restricted user / job object, a
  read-only mount of everything outside the one-shot directory, and no network),
  and
- **authentication / authorization** on the API routes.

A regex blocklist of shell features (`$()`, backticks, `node -e`, …) is **not** a
fix: it gives false confidence and breaks legitimate scripts. Only real OS-level
isolation closes the hole.

## Reporting

This is a personal, local tool with no network service to attack. If you adapt
it for shared/hosted use, address the requirements above first.
