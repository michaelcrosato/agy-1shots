/**
 * Verification Harness for OneShotForge E2E Tests
 * Path: tests/e2e/verify.js
 *
 * This harness runs the test suite against the REAL Next.js dashboard
 * (dashboard/app/api/*), not a mock. It:
 *   1. Builds the dashboard (unless SKIP_BUILD=1).
 *   2. Starts the production server (`next start`) on PORT (default 3000).
 *   3. Waits until the server answers HTTP, then runs tests/e2e/runner.js
 *      against it (the runner reads DASHBOARD_URL).
 *   4. Tears the server down (cross-platform) and exits with the runner's code.
 *
 * Why this matters: the gate's whole purpose is to objectively verify the
 * product. Testing a hand-written mock of the API would only verify the mock,
 * and the mock inevitably drifts from the real route handlers. Exercising the
 * actual server is the only honest "opaque-box" test of observable behavior.
 *
 * Env knobs:
 *   PORT                  - port to serve/test on (default 3000)
 *   SKIP_BUILD=1          - reuse the existing .next build instead of rebuilding
 *   USE_RUNNING_SERVER=1  - don't build/start; just run the suite against an
 *                           already-running server at DASHBOARD_URL
 *   DASHBOARD_URL         - base URL the runner targets (default http://localhost:PORT)
 */

const path = require('path');
const http = require('http');
const { spawn, exec } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const BASE_URL = process.env.DASHBOARD_URL || `http://localhost:${PORT}`;

const repoRoot = path.resolve(__dirname, '../..');
const dashboardDir = path.join(repoRoot, 'dashboard');
const nextBin = path.join(dashboardDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const runnerPath = path.join(__dirname, 'runner.js');

const isWin = process.platform === 'win32';
const SKIP_BUILD = /^(1|true|yes)$/i.test(process.env.SKIP_BUILD || '');
const USE_RUNNING_SERVER = /^(1|true|yes)$/i.test(process.env.USE_RUNNING_SERVER || '');

let serverChild = null;

function log(msg) {
  console.log(`[verify] ${msg}`);
}

// Spawn a node process running the Next.js CLI directly (no npm/.cmd wrapper),
// so we always get a single node child whose process tree we can reliably reap.
function spawnNext(args, opts = {}) {
  return spawn(process.execPath, [nextBin, ...args], {
    cwd: dashboardDir,
    ...opts,
  });
}

function buildDashboard() {
  return new Promise((resolve, reject) => {
    log('Building dashboard (next build)...');
    const child = spawnNext(['build'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        log('Build succeeded.');
        resolve();
      } else {
        reject(new Error(`next build failed with exit code ${code}`));
      }
    });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    log(`Starting dashboard server on port ${PORT} (next start)...`);
    // detached on POSIX so we can signal the whole process group on teardown.
    serverChild = spawnNext(['start', '-p', String(PORT), '-H', HOST], {
      stdio: 'inherit',
      detached: !isWin,
    });

    let settled = false;
    serverChild.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    serverChild.on('exit', (code) => {
      // If the server dies before/while we're waiting, fail loudly.
      if (!settled) {
        settled = true;
        reject(new Error(`dashboard server exited early with code ${code}`));
      }
    });

    waitForReady()
      .then(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
  });
}

// Poll an HTTP endpoint until it answers (any status) or we time out.
function waitForReady(timeoutMs = 60000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  const probeUrl = `${BASE_URL}/api/scan`;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(probeUrl, (res) => {
        res.resume();
        log(`Server is ready (${probeUrl} -> ${res.statusCode}).`);
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`server did not become ready within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    };
    attempt();
  });
}

function runRunner() {
  return new Promise((resolve, reject) => {
    log('Running test runner against the live server...');
    const child = spawn(process.execPath, [runnerPath], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, DASHBOARD_URL: BASE_URL },
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code === null ? 1 : code));
  });
}

// Fast, server-less unit suites — run before the expensive build so a broken
// invariant fails the gate immediately.
function runUnitTests() {
  return new Promise((resolve) => {
    log('Running unit suites (tests/run-unit.js)...');
    const child = spawn(process.execPath, [path.join(repoRoot, 'tests', 'run-unit.js')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code === null ? 1 : code));
  });
}

function teardown() {
  if (!serverChild || serverChild.killed) return;
  const pid = serverChild.pid;
  if (!pid) return;
  log('Stopping dashboard server...');
  if (isWin) {
    try {
      exec(`taskkill /f /t /pid ${pid}`, () => {});
    } catch (e) {
      /* ignore */
    }
  } else {
    // Kill the whole process group (negative pid); fall back to the child.
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (e) {
      try {
        serverChild.kill('SIGKILL');
      } catch (e2) {
        /* ignore */
      }
    }
  }
  serverChild = null;
}

// Make sure we never leave an orphaned server behind.
process.on('SIGINT', () => {
  teardown();
  process.exit(130);
});
process.on('SIGTERM', () => {
  teardown();
  process.exit(143);
});

async function main() {
  console.log('==================================================');
  console.log('OneShotForge Verification (live application)');
  console.log(`Target: ${BASE_URL}`);
  console.log('==================================================');

  const unitCode = await runUnitTests();
  if (unitCode !== 0) {
    console.error('[verify] Unit suites failed — aborting before the e2e gate.');
    process.exit(unitCode);
  }

  if (USE_RUNNING_SERVER) {
    log('USE_RUNNING_SERVER set: skipping build/start; testing existing server.');
    const code = await runRunner();
    finish(code);
    return;
  }

  if (SKIP_BUILD) {
    log('SKIP_BUILD set: reusing existing .next build.');
  } else {
    await buildDashboard();
  }

  await startServer();
  const code = await runRunner();
  teardown();
  finish(code);
}

function finish(code) {
  console.log('--------------------------------------------------');
  if (code === 0) {
    console.log('VERIFICATION SUCCESS: all tests passed against the live app.');
  } else {
    console.error(`VERIFICATION FAILURE: tests failed (exit code ${code}).`);
  }
  console.log('--------------------------------------------------');
  process.exit(code);
}

main().catch((err) => {
  console.error('[verify] Verification error:', err.message);
  teardown();
  process.exit(1);
});
