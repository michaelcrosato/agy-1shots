import { NextResponse } from 'next/server';
import {
  resolveOneShot,
  updateManifest,
  validateObservationsInput,
  ManifestError,
} from '../../../../lib/manifest';
import { regenerateLessonsFile } from '../../../../lib/lessons-file';

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

// POST /api/manifest/observations  { id, attemptId, wentWell?, struggled?, lessons? }
// Adds the qualitative teaching record to an existing attempt. Write-once:
// observations may be ADDED to an attempt that has none, never edited or
// removed — telemetry and history stay immutable (409 on conflict).
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
  if (typeof body.attemptId !== 'string' || !body.attemptId) {
    return jsonError(400, 'Bad Request: attemptId is required');
  }

  const resolved = resolveOneShot(body.id);
  if (!resolved.ok) {
    return jsonError(resolved.status, 'Not Found');
  }

  let observations;
  try {
    const validated = validateObservationsInput({
      wentWell: body.wentWell,
      struggled: body.struggled,
      lessons: body.lessons,
    });
    if (!validated) {
      return jsonError(400, 'At least one observation entry is required');
    }
    observations = { ...validated, notedAt: new Date().toISOString() };
    await updateManifest(resolved.targetDir, resolved.manifestPath, (current) => {
      const attempt = current.attempts.find((a) => a.id === body.attemptId);
      if (!attempt) {
        throw new ManifestError(404, 'Attempt not found');
      }
      if (attempt.observations && typeof attempt.observations === 'object') {
        throw new ManifestError(409, 'Observations already recorded for this attempt (write-once)');
      }
      attempt.observations = observations;
      return current;
    });
  } catch (e) {
    if (e instanceof ManifestError) {
      return jsonError(e.status, e.message);
    }
    return jsonError(500, 'Internal Server Error');
  }

  regenerateLessonsFile();
  return NextResponse.json({ success: true, observations });
}
