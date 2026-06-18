import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

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

  // Validate existence of target directory
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const readmePath = path.join(targetDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    return NextResponse.json({ readme: 'no readme' });
  }

  try {
    const rawReadme = fs.readFileSync(readmePath, 'utf8');
    const parsedHtml = await marked.parse(rawReadme);

    // Sanitize script tags and javascript: links
    const cleanHtml = sanitizeHtml(parsedHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'img']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        a: ['href', 'name', 'target'],
      },
      // Ensure we sanitize javascript: protocols
      allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
      allowedSchemesAppliedToAttributes: ['href', 'src'],
    });

    return NextResponse.json({ readme: cleanHtml });
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
