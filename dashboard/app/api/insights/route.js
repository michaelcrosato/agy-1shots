import path from 'path';
import { NextResponse } from 'next/server';
import { collectPieces, buildInsights } from '../../../lib/insights';

export const dynamic = 'force-dynamic';

// GET /api/insights — the teaching aggregate: per-model profiles, the
// one-shot × model scoreboard, and the lessons feed.
export async function GET() {
  try {
    const pieces = collectPieces(path.resolve(process.cwd(), '../one-shots'));
    return NextResponse.json(buildInsights(pieces));
  } catch (e) {
    console.error('Error building insights:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
