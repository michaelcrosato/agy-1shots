import path from 'path';
import { exec } from 'child_process';

// Shared, security-hardened executor for one-shot package scripts.
// Extracted from app/api/run/route.js so both /api/run and /api/manifest/verify
// share a single audited exec path (per-id mutex, env sanitization, timeout).

if (!global.runLocks) {
  global.runLocks = new Map();
}

// Per-one-shot mutex: serializes concurrent executions of the same id.
// The returned release() also evicts the key once the chain drains, so the
// map stays flat instead of accumulating one entry per id forever.
export async function acquireLock(id) {
  const currentPromise = global.runLocks.get(id) || Promise.resolve();
  let release;
  const nextPromise = new Promise((resolve) => {
    release = resolve;
  });
  global.runLocks.set(id, nextPromise);
  await currentPromise;
  return () => {
    release();
    if (global.runLocks.get(id) === nextPromise) {
      global.runLocks.delete(id);
    }
  };
}

// Env keys that can run code or hijack loaders at process startup. sanitizeEnv
// strips these from any CALLER-supplied env delta only (the UI never sends env),
// so denying more here is zero-risk defense-in-depth for the direct-API path.
const DANGEROUS_ENV_KEYS = [
  'NODE_OPTIONS',
  'PATH',
  'LD_PRELOAD',
  'PYTHONPATH',
  'NODE_PATH',
  'BASH_ENV',
  'ENV',
  'IFS',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'GIT_SSH',
  'GIT_EXTERNAL_DIFF',
];

// Drops env keys that could be used to escape the sandbox.
export function sanitizeEnv(customEnv) {
  const out = {};
  if (customEnv && typeof customEnv === 'object') {
    for (const [key, val] of Object.entries(customEnv)) {
      if (DANGEROUS_ENV_KEYS.includes(key.toUpperCase())) {
        continue;
      }
      out[key] = val;
    }
  }
  return out;
}

// Splits a command string into args, honoring single/double quotes.
export function parseArgs(commandStr) {
  const args = [];
  const regex = /"([^"]+)"|'([^']+)'|([^\s"']+)/g;
  let match;
  while ((match = regex.exec(commandStr)) !== null) {
    const arg = match[1] || match[2] || match[3];
    if (arg) {
      args.push(arg);
    }
  }
  return args;
}

// SAFETY RAIL — NOT A SECURITY SANDBOX. The command comes from the one-shot's
// OWN committed package.json (trusted, operator/agent-authored input) and runs
// in a full shell with the operator's privileges, so a script can trivially run
// arbitrary code by design ($()/backticks/env-expansion/`node -e`). This only
// blocks ACCIDENTAL path-traversal / absolute-path escapes in a malformed
// one-shot you wrote — do not mistake it for containment. See SECURITY.md for
// the trust model and when real OS-level sandboxing becomes required.
//
// Returns true if the command (or any of its args) attempts to read/write
// outside the one-shot's target directory.
export function detectCommandEscape(cmd, targetDir) {
  if (cmd.includes('..') || (path.isAbsolute(cmd) && !cmd.startsWith(targetDir))) {
    return true;
  }

  const commandArgs = parseArgs(cmd);
  for (const arg of commandArgs) {
    const strippedArg = arg.replace(/^["']|["']$/g, '');
    const containsDotDot = strippedArg.includes('..');
    const startsWithDrive = /^[a-zA-Z]:[\\/]/.test(strippedArg);
    const startsWithSlash = strippedArg.startsWith('\\') || strippedArg.startsWith('/');

    if (containsDotDot || startsWithDrive || startsWithSlash) {
      const resolvedPath = path.resolve(targetDir, strippedArg);
      const relative = path.relative(targetDir, resolvedPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return true;
      }
    }
  }
  return false;
}

// Clamps the execution timeout to a sane default/maximum.
export function normalizeTimeout(timeout) {
  let execTimeout = 30000;
  if (timeout !== undefined && timeout !== null) {
    const parsed = Number(timeout);
    if (!isNaN(parsed) && parsed > 0) {
      execTimeout = parsed;
    }
  }
  if (execTimeout > 2147483647) {
    execTimeout = 2147483647;
  }
  return execTimeout;
}

// Runs `cmd` inside `targetDir`. Assumes the caller has already validated the
// id, the command, and any escape attempts. Returns a plain result object:
//   { success, exitCode, stdout, stderr, error, timedOut }
export async function runScript({ id, targetDir, cmd, timeout, env }) {
  const processEnv = { ...process.env, ...sanitizeEnv(env) };
  // On POSIX, run the child in its own process group so a timeout can reap the
  // whole tree (the script plus anything it spawned), not just the shell.
  const isWin = process.platform === 'win32';
  // 10 MB so a verbose-but-successful build/test isn't truncated and reported as
  // a failure — exec's 1 MB default raises ERR_CHILD_PROCESS_STDIO_MAXBUFFER.
  const execOptions = {
    cwd: targetDir,
    env: processEnv,
    detached: !isWin,
    maxBuffer: 10 * 1024 * 1024,
  };
  const execTimeout = normalizeTimeout(timeout);

  const release = await acquireLock(id);

  try {
    return await new Promise((resolve) => {
      let timer = null;
      let killed = false;

      const child = exec(cmd, execOptions, (error, stdout, stderr) => {
        if (timer) clearTimeout(timer);
        if (killed) return;

        let exitCode = 0;
        let success = true;

        if (error) {
          // error.code is the numeric child exit code for a normal non-zero
          // exit, but a STRING (e.g. ERR_CHILD_PROCESS_STDIO_MAXBUFFER) for
          // internal exec failures — coerce non-numbers to 1 so exitCode
          // comparisons (e.g. acceptance successExitCode) never silently mismatch.
          exitCode = typeof error.code === 'number' ? error.code : 1;
          success = false;
        }

        resolve({
          success,
          exitCode,
          stdout,
          stderr,
          error: null,
          timedOut: false,
        });
      });

      if (execTimeout) {
        timer = setTimeout(() => {
          killed = true;

          if (isWin) {
            try {
              exec(`taskkill /f /pid ${child.pid} /t`, () => {});
            } catch (e) {
              // Ignore kill errors
            }
          } else {
            // Kill the whole process group (negative pid); fall back to the
            // direct child if the group signal fails.
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch (e) {
              try {
                child.kill('SIGKILL');
              } catch (e2) {
                // Ignore kill errors
              }
            }
          }

          resolve({
            success: false,
            exitCode: null,
            stdout: '',
            stderr: 'timeout occurred during execution',
            error: 'timeout occurred during execution',
            timedOut: true,
          });
        }, execTimeout);
      }
    });
  } finally {
    release();
  }
}
