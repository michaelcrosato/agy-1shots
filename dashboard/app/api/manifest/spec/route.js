import { NextResponse } from "next/server";
import {
  resolveOneShot,
  updateManifest,
  validateSpecInput,
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

// POST /api/manifest/spec  { id, vision, acceptance? }
// Creates the immutable spec block. Write-once: returns 409 if a vision already
// exists. There is intentionally no route to edit or delete a spec.
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

  let spec;
  try {
    const validated = validateSpecInput(body);
    spec = await updateManifest(
      resolved.targetDir,
      resolved.manifestPath,
      (current) => {
        if (
          current.spec &&
          typeof current.spec.vision === "string" &&
          current.spec.vision.trim()
        ) {
          throw new ManifestError(409, "Vision already set; spec is write-once");
        }
        current.spec = {
          vision: validated.vision,
          createdAt: new Date().toISOString(),
          acceptance: validated.acceptance,
        };
        return current;
      },
    );
  } catch (e) {
    if (e instanceof ManifestError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(500, "Internal Server Error");
  }

  return NextResponse.json({ success: true, spec: spec.spec });
}
