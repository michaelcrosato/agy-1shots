import { NextResponse } from "next/server";
import {
  resolveOneShot,
  updateManifest,
  validateAttemptInput,
  generateAttemptId,
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

// POST /api/manifest/attempt  { id, model?, environment?, build?, runtime?, evaluation? }
// Appends a new attempt to the append-only history. The id and timestamp are
// generated server-side; existing attempts are never modified.
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

  const resolved = resolveOneShot(body.id);
  if (!resolved.ok) {
    return jsonError(resolved.status, "Not Found");
  }

  let attempt;
  try {
    const fields = validateAttemptInput(body);
    attempt = {
      id: generateAttemptId(),
      timestamp: new Date().toISOString(),
      ...fields,
    };
    await updateManifest(
      resolved.targetDir,
      resolved.manifestPath,
      (current) => {
        current.attempts.push(attempt);
        return current;
      },
    );
  } catch (e) {
    if (e instanceof ManifestError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(500, "Internal Server Error");
  }

  return NextResponse.json({ success: true, attempt });
}
