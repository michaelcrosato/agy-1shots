import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { NextResponse } from "next/server";
import { incrementTotalRuns, incrementFailedRuns } from "../../../lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

export async function PUT() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

export async function DELETE() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

if (!global.runLocks) {
  global.runLocks = new Map();
}

async function acquireLock(id) {
  const currentPromise = global.runLocks.get(id) || Promise.resolve();
  let release;
  const nextPromise = new Promise((resolve) => {
    release = resolve;
  });
  global.runLocks.set(id, nextPromise);
  await currentPromise;
  return release;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body.id !== "string" || !body.action) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id, action, timeout, env: customEnv } = body;

  // Path traversal protection
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Shell injection protection in ID
  if (/[;&|`$]/.test(id)) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const oneShotsDir = path.resolve(process.cwd(), "../one-shots");
  const targetDir = path.join(oneShotsDir, id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pkgPath = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg === null || typeof pkg !== "object") {
      pkg = {};
    }
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!pkg.scripts || !pkg.scripts[action]) {
    return new NextResponse(
      JSON.stringify({ error: "Bad Request: Action not found in scripts" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const cmd = pkg.scripts[action];

  // Security isolation check: prevent directory traversal or absolute path escapes
  if (
    cmd.includes("..") ||
    (path.isAbsolute(cmd) && !cmd.startsWith(targetDir))
  ) {
    await incrementTotalRuns();
    await incrementFailedRuns();
    return NextResponse.json({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr:
        "Security violation: command attempts to access paths outside target directory",
      error: "Security violation: write outside target directory blocked",
    });
  }

  // Helper function to parse arguments (supporting quotes)
  const parseArgs = (commandStr) => {
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
  };

  // Parse and validate arguments to prevent sandbox escape
  const commandArgs = parseArgs(cmd);
  let hasSecurityViolation = false;
  for (const arg of commandArgs) {
    const strippedArg = arg.replace(/^["']|["']$/g, "");
    const containsDotDot = strippedArg.includes("..");
    const startsWithDrive = /^[a-zA-Z]:[\\/]/.test(strippedArg);
    const startsWithSlash =
      strippedArg.startsWith("\\") || strippedArg.startsWith("/");

    if (containsDotDot || startsWithDrive || startsWithSlash) {
      const resolvedPath = path.resolve(targetDir, strippedArg);
      const relative = path.relative(targetDir, resolvedPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        hasSecurityViolation = true;
        break;
      }
    }
  }

  if (hasSecurityViolation) {
    await incrementTotalRuns();
    await incrementFailedRuns();
    return NextResponse.json({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr:
        "Security violation: command arguments attempt to escape target directory",
      error: "Security violation: escape outside target directory blocked",
    });
  }

  // Update totalRuns stat
  await incrementTotalRuns();

  // Environment Variable Sanitization
  const dangerousEnvKeys = [
    "NODE_OPTIONS",
    "PATH",
    "LD_PRELOAD",
    "PYTHONPATH",
    "NODE_PATH",
  ];
  const sanitizedCustomEnv = {};
  if (customEnv && typeof customEnv === "object") {
    for (const [key, val] of Object.entries(customEnv)) {
      if (dangerousEnvKeys.includes(key.toUpperCase())) {
        continue;
      }
      sanitizedCustomEnv[key] = val;
    }
  }

  const processEnv = { ...process.env, ...sanitizedCustomEnv };
  const execOptions = { cwd: targetDir, env: processEnv };

  // Enforce default timeout of 30 seconds (30000ms) if not supplied
  let execTimeout = 30000;
  if (timeout !== undefined && timeout !== null) {
    const parsed = Number(timeout);
    if (!isNaN(parsed) && parsed > 0) {
      execTimeout = parsed;
    }
  }

  // Cap at 2147483647 to prevent integer overflow
  if (execTimeout > 2147483647) {
    execTimeout = 2147483647;
  }

  // Workspace mutex locking per script id
  const release = await acquireLock(id);

  try {
    return await new Promise((resolve) => {
      let timer = null;
      let killed = false;

      const child = exec(cmd, execOptions, async (error, stdout, stderr) => {
        if (timer) clearTimeout(timer);
        if (killed) return;

        let exitCode = 0;
        let success = true;

        if (error) {
          exitCode = error.code !== undefined ? error.code : 1;
          success = false;
          await incrementFailedRuns();
        }

        resolve(NextResponse.json({ success, exitCode, stdout, stderr }));
      });

      if (execTimeout) {
        timer = setTimeout(async () => {
          killed = true;

          if (process.platform === "win32") {
            try {
              exec(`taskkill /f /pid ${child.pid} /t`, () => {});
            } catch (e) {
              // Ignore kill errors
            }
          } else {
            try {
              child.kill("SIGKILL");
            } catch (e) {
              // Ignore kill errors
            }
          }

          await incrementFailedRuns();

          resolve(
            NextResponse.json({
              success: false,
              exitCode: null,
              stdout: "",
              stderr: "timeout occurred during execution",
              error: "timeout occurred during execution",
            }),
          );
        }, execTimeout);
      }
    });
  } finally {
    release();
  }
}
