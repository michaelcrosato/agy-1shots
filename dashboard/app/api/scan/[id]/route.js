import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;

  if (typeof id !== 'string' || !id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const oneShotsDir = path.resolve(process.cwd(), '../one-shots');
  const targetDir = path.join(oneShotsDir, id);

  // Validate existence
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pkgPath = path.join(targetDir, 'package.json');
  let pkgExists = false;
  try {
    pkgExists = fs.existsSync(pkgPath);
  } catch (err) {
    pkgExists = false;
  }

  let pkg = {};
  if (pkgExists) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg === null || typeof pkg !== 'object') {
        pkg = {};
      }
    } catch (e) {
      pkg = {};
    }
  }

  const name = typeof pkg.name === 'string' ? pkg.name : id;
  const version = typeof pkg.version === 'string' ? pkg.version : '1.0.0';
  const description = typeof pkg.description === 'string' ? pkg.description : '';
  const tags = Array.isArray(pkg.tags) ? pkg.tags.filter((t) => typeof t === 'string') : [];

  return NextResponse.json({
    id,
    name,
    version,
    description,
    tags,
    path: targetDir,
  });
}
