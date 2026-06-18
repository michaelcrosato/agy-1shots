import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { readManifestSyncWithStatus, summarizeManifest } from '../../../lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const tag = searchParams.get('tag');

  const oneShotsDir = path.resolve(process.cwd(), '../one-shots');
  if (!fs.existsSync(oneShotsDir)) {
    return NextResponse.json([]);
  }

  let files = [];
  try {
    files = fs.readdirSync(oneShotsDir);
  } catch (err) {
    files = [];
  }
  const results = [];

  for (const file of files) {
    const fullPath = path.join(oneShotsDir, file);
    try {
      let isDir = false;
      try {
        isDir = fs.statSync(fullPath).isDirectory();
      } catch (err) {
        continue;
      }
      if (isDir) {
        const pkgPath = path.join(fullPath, 'package.json');
        let pkgExists = false;
        try {
          pkgExists = fs.existsSync(pkgPath);
        } catch (err) {
          pkgExists = false;
        }

        if (pkgExists) {
          let pkg = {};
          try {
            const pkgContent = fs.readFileSync(pkgPath, 'utf8');
            pkg = JSON.parse(pkgContent);
          } catch (e) {
            // pkg remains {}
          }

          const name = typeof pkg.name === 'string' ? pkg.name : file;
          const version = typeof pkg.version === 'string' ? pkg.version : '1.0.0';
          const description = typeof pkg.description === 'string' ? pkg.description : '';
          const tags = Array.isArray(pkg.tags) ? pkg.tags.filter((t) => typeof t === 'string') : [];

          const { manifest: parsedManifest, status: manifestStatus } =
            readManifestSyncWithStatus(fullPath);
          const manifest = summarizeManifest(parsedManifest, manifestStatus);

          results.push({
            id: file,
            name,
            version,
            description,
            tags,
            path: fullPath,
            manifest,
          });
        }
      }
    } catch (e) {
      // Gracefully handle any other loop errors
    }
  }

  let filtered = results;

  if (search) {
    const query = search.trim().toLowerCase();
    filtered = filtered.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query))
    );
  }

  if (tag) {
    const query = tag.trim().toLowerCase();
    filtered = filtered.filter(
      (item) => item.tags && item.tags.some((t) => t.toLowerCase() === query)
    );
  }

  // Sort alphabetically by name ascending
  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return NextResponse.json(filtered);
}
