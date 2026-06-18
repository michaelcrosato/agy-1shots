import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: 'Bad Request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body || typeof body.id !== 'string') {
    return new NextResponse(JSON.stringify({ error: 'Bad Request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id, prompt, updates } = body;

  // 1. Path traversal and physical existence validation first (must return 404 for invalid ID)
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const oneShotsDir = path.resolve(process.cwd(), '../one-shots');
  const targetDir = path.join(oneShotsDir, id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Body validation checks second (returns 400 if updates/prompt missing)
  if (!prompt || !updates) {
    return new NextResponse(JSON.stringify({ error: 'Bad Request: Missing prompt or updates' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    return new NextResponse(
      JSON.stringify({
        error: 'Bad Request: updates must be a valid JSON object',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const allowedKeys = ['name', 'version', 'description', 'tags'];
  const prototypePollutionKeys = ['__proto__', 'constructor', 'prototype'];

  const keys = Object.keys(updates);
  for (const key of keys) {
    if (prototypePollutionKeys.includes(key)) {
      return new NextResponse(
        JSON.stringify({ error: 'Bad Request: Prototype pollution detected' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!allowedKeys.includes(key)) {
      return new NextResponse(
        JSON.stringify({
          error: `Bad Request: Key '${key}' is not allowed for updates`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const val = updates[key];
    if (key === 'name' || key === 'version' || key === 'description') {
      if (typeof val !== 'string') {
        return new NextResponse(
          JSON.stringify({ error: `Bad Request: '${key}' must be a string` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    if (key === 'tags') {
      if (!Array.isArray(val) || val.some((item) => typeof item !== 'string')) {
        return new NextResponse(
          JSON.stringify({
            error: `Bad Request: 'tags' must be an array of strings`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    for (const key of keys) {
      pkg[key] = updates[key];
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
