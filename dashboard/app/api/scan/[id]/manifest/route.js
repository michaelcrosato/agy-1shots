import { NextResponse } from "next/server";
import {
  resolveOneShot,
  readManifestWithStatus,
  summarizeManifest,
} from "../../../../../lib/manifest";

export const dynamic = "force-dynamic";

// GET /api/scan/:id/manifest
// Returns the full manifest for a one-shot, or a normalized empty default
// (hasManifest:false) when no oneshot.json exists. 404 only for invalid ids.
export async function GET(request, { params }) {
  const { id } = await params;

  const resolved = resolveOneShot(id);
  if (!resolved.ok) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { manifest, status } = await readManifestWithStatus(resolved.targetDir);
  const summary = summarizeManifest(manifest, status);

  return NextResponse.json({
    id,
    schemaVersion: manifest.schemaVersion,
    spec: manifest.spec,
    attempts: manifest.attempts,
    ...summary,
  });
}
