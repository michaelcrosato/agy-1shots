import fs from 'fs';
import { NextResponse } from 'next/server';
import {
  resolveOneShot,
  readManifest,
  updateManifest,
  ManifestError,
} from '../../../../lib/manifest';
import { runScript, detectCommandEscape } from '../../../../lib/exec';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

function jsonError(status, message) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/manifest/verify  { id, attemptId?, timeout? }
// Runs the one-shot's acceptance-test script (spec.acceptance.script, default
// "verify") through the shared safe-exec pipeline and maps exit code to a
// pass/fail. When attemptId is given, the result is recorded as that attempt's
// evaluation. Intentionally kept OUT of the global run counters.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonError(400, 'Bad Request');
  }
  if (!body || typeof body.id !== 'string') {
    return jsonError(400, 'Bad Request');
  }

  const resolved = resolveOneShot(body.id);
  if (!resolved.ok) {
    return jsonError(resolved.status, 'Not Found');
  }

  const manifest = await readManifest(resolved.targetDir);
  const acceptance = manifest.spec && manifest.spec.acceptance;
  if (!acceptance || acceptance.mode !== 'program') {
    return jsonError(
      400,
      "Bad Request: acceptance.mode must be 'program' to run a verification test"
    );
  }
  const scriptKey =
    typeof acceptance.script === 'string' && acceptance.script.trim()
      ? acceptance.script.trim()
      : 'verify';
  const successExitCode = Number.isInteger(acceptance.successExitCode)
    ? acceptance.successExitCode
    : 0;

  // If recording against an attempt, confirm it exists before running.
  const attemptId = typeof body.attemptId === 'string' && body.attemptId ? body.attemptId : null;
  if (attemptId && !manifest.attempts.some((a) => a.id === attemptId)) {
    return jsonError(404, 'Attempt not found');
  }

  // Load the script command from package.json.
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(resolved.pkgPath, 'utf8'));
    if (pkg === null || typeof pkg !== 'object') pkg = {};
  } catch (e) {
    return jsonError(404, 'Not Found');
  }
  if (!pkg.scripts || !pkg.scripts[scriptKey]) {
    return jsonError(400, `Bad Request: '${scriptKey}' not found in scripts`);
  }

  const cmd = pkg.scripts[scriptKey];
  if (detectCommandEscape(cmd, resolved.targetDir)) {
    return jsonError(
      400,
      'Security violation: command attempts to access paths outside target directory'
    );
  }

  const result = await runScript({
    id: body.id,
    targetDir: resolved.targetDir,
    cmd,
    timeout: body.timeout,
  });

  const passed = result.exitCode === successExitCode;

  if (attemptId) {
    const feedbackParts = [];
    if (result.stdout) feedbackParts.push(result.stdout);
    if (result.stderr) feedbackParts.push(result.stderr);
    let feedback = feedbackParts.join('\n').slice(0, 4000);

    try {
      await updateManifest(resolved.targetDir, resolved.manifestPath, (current) => {
        const attempt = current.attempts.find((a) => a.id === attemptId);
        if (!attempt) {
          throw new ManifestError(404, 'Attempt not found');
        }
        attempt.evaluation = {
          method: 'program',
          fidelityScore: null,
          passed,
          feedback,
          evaluatedAt: new Date().toISOString(),
        };
        return current;
      });
    } catch (e) {
      if (e instanceof ManifestError) {
        return jsonError(e.status, e.message);
      }
      return jsonError(500, 'Internal Server Error');
    }
  }

  const payload = {
    success: result.success,
    passed,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    recorded: !!attemptId,
  };
  if (result.error) {
    payload.error = result.error;
  }
  return NextResponse.json(payload);
}
