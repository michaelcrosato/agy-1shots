const fs = require('fs');
const path = require('path');

// F13: Dashboard API Suggest
//
// Exercises the REAL /api/suggest analyzer in dashboard/app/api/suggest/route.js.
// This route inspects a one-shot's files and returns concrete, typed
// improvement suggestions. It has rich, content-dependent behavior (missing
// package.json, malformed JSON, missing Notion SDK, mock-code detection, ...).
// Running the suite against the live application is what makes this verifiable:
// a mocked endpoint could only return canned data and would never catch a
// regression in the actual analyzer.
describe('F13: Dashboard API Suggest', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const oneShotsDir = path.resolve(__dirname, '../../../one-shots');
  const tempDirs = [];

  function rm(p) {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  }

  function mkTemp(name) {
    const p = path.join(oneShotsDir, name);
    rm(p);
    fs.mkdirSync(p, { recursive: true });
    tempDirs.push(p);
    return p;
  }

  async function suggest(id) {
    const res = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    return { status: res.status, body };
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      rm(p);
    }
  });

  test('F13_1: GET /api/suggest is not allowed (405)', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/suggest`, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  test('F13_2: missing body / id returns 400', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('F13_3: non-existent one-shot returns 404', async () => {
    const { status } = await suggest('totally-does-not-exist-xyz');
    expect(status).toBe(404);
  });

  test('F13_4: path traversal in id returns 404', async () => {
    const { status } = await suggest('../dashboard');
    expect(status).toBe(404);
  });

  test('F13_5: empty directory flags missing package.json and missing index.js', async () => {
    const name = 'temp-suggest-empty';
    mkTemp(name);

    const { status, body } = await suggest(name);
    expect(status).toBe(200);
    const suggestions = body.suggestions;
    expect(Array.isArray(suggestions)).toBe(true);

    const hasMissingPkg = suggestions.some(
      (s) => s.type === 'configuration' && s.description.includes('Missing package.json')
    );
    const hasMissingIndex = suggestions.some(
      (s) => s.type === 'implementation' && s.description.includes('Missing main execution script')
    );
    expect(hasMissingPkg).toBe(true);
    expect(hasMissingIndex).toBe(true);
  });

  test('F13_6: malformed package.json is detected', async () => {
    const name = 'temp-suggest-malformed';
    const dir = mkTemp(name);
    fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "broken", ', 'utf8');

    const { status, body } = await suggest(name);
    expect(status).toBe(200);
    const hasMalformed = body.suggestions.some(
      (s) => s.type === 'configuration' && s.description.includes('malformed or invalid JSON')
    );
    expect(hasMalformed).toBe(true);
  });

  test('F13_7: notion one-shot missing the SDK dependency is flagged', async () => {
    const name = 'temp-suggest-notion';
    const dir = mkTemp(name);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'temp-notion-thing',
        version: '1.0.0',
        description: 'A notion scraper',
        tags: ['scraper'],
        scripts: { start: 'node index.js', test: 'node index.js --test' },
        dependencies: {},
      }),
      'utf8'
    );

    const { status, body } = await suggest(name);
    expect(status).toBe(200);
    const hasSdk = body.suggestions.some(
      (s) => s.type === 'dependency' && s.description.includes('@notionhq/client')
    );
    expect(hasSdk).toBe(true);
  });

  test('F13_8: dummy mock code in index.js is detected', async () => {
    const name = 'temp-suggest-mock';
    const dir = mkTemp(name);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: name,
        version: '1.0.0',
        description: 'has mock code',
        tags: ['utility'],
        scripts: { start: 'node index.js', test: 'node index.js --test' },
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'index.js'),
      'console.log("Mock notion-scraper execution successful");',
      'utf8'
    );

    const { status, body } = await suggest(name);
    expect(status).toBe(200);
    const hasMock = body.suggestions.some(
      (s) => s.type === 'implementation' && s.description.includes('Dummy mock code detected')
    );
    expect(hasMock).toBe(true);
  });
});
