import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { incrementTotalRuns, incrementFailedRuns } from "../../../lib/stats";
import { runScript, detectCommandEscape } from "../../../lib/exec";

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

function jsonError(status, message) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonError(400, "Bad Request");
  }

  if (!body || typeof body.id !== "string" || !body.action) {
    return jsonError(400, "Bad Request");
  }

  const { id, action, timeout, env: customEnv } = body;

  // Path traversal protection
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return jsonError(404, "Not Found");
  }

  // Shell injection protection in ID
  if (/[;&|`$]/.test(id)) {
    return jsonError(400, "Bad Request");
  }

  const oneShotsDir = path.resolve(process.cwd(), "../one-shots");
  const targetDir = path.join(oneShotsDir, id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return jsonError(404, "Not Found");
  }

  const pkgPath = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return jsonError(404, "Not Found");
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg === null || typeof pkg !== "object") {
      pkg = {};
    }
  } catch (e) {
    return jsonError(400, "Bad Request");
  }

  if (!pkg.scripts || !pkg.scripts[action]) {
    return jsonError(400, "Bad Request: Action not found in scripts");
  }

  const cmd = pkg.scripts[action];

  // Security isolation: prevent directory traversal or absolute path escapes
  // in the command or any of its arguments.
  if (detectCommandEscape(cmd, targetDir)) {
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

  // Update totalRuns stat
  await incrementTotalRuns();

  const result = await runScript({ id, targetDir, cmd, timeout, env: customEnv });

  if (!result.success) {
    await incrementFailedRuns();
  }

  const payload = {
    success: result.success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (result.error) {
    payload.error = result.error;
  }
  return NextResponse.json(payload);
}
