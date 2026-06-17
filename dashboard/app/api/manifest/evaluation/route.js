import { NextResponse } from "next/server";
import {
  resolveOneShot,
  updateManifest,
  validateEvaluationInput,
  ManifestError,
} from "../../../../lib/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

function jsonError(status, message) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// POST /api/manifest/evaluation  { id, attemptId, method?, fidelityScore?, passed?, feedback? }
// Records the evaluation ("how close to the vision?") for an existing attempt.
// Only the evaluation sub-object is touched; cost fields are never altered.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonError(400, "Bad Request");
  }
  if (!body || typeof body.id !== "string") {
    return jsonError(400, "Bad Request");
  }
  if (typeof body.attemptId !== "string" || !body.attemptId) {
    return jsonError(400, "Bad Request: attemptId is required");
  }

  const resolved = resolveOneShot(body.id);
  if (!resolved.ok) {
    return jsonError(resolved.status, "Not Found");
  }

  let evaluation;
  try {
    const validated = validateEvaluationInput(body);
    evaluation = { ...validated, evaluatedAt: new Date().toISOString() };
    await updateManifest(
      resolved.targetDir,
      resolved.manifestPath,
      (current) => {
        const attempt = current.attempts.find((a) => a.id === body.attemptId);
        if (!attempt) {
          throw new ManifestError(404, "Attempt not found");
        }
        attempt.evaluation = evaluation;
        return current;
      },
    );
  } catch (e) {
    if (e instanceof ManifestError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(500, "Internal Server Error");
  }

  return NextResponse.json({ success: true, evaluation });
}
