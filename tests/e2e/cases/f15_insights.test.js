const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// F15: Learning layer — write-once observations + the insights aggregate.
//
// Exercises the REAL /api/manifest/observations and /api/insights routes
// against the live app, including the write-once (409) invariant and the
// LESSONS.md regeneration side effect.
describe('F15: Insights & Observations', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const repoRoot = path.resolve(__dirname, '../../..');
  const oneShotsDir = path.join(repoRoot, 'one-shots');
  const lessonsPath = path.join(repoRoot, 'LESSONS.md');
  const tempDirs = [];

  function rm(p) {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 });
  }

  function mkOneShot(name, attempts) {
    const dir = path.join(oneShotsDir, name);
    rm(dir);
    fs.mkdirSync(dir, { recursive: true });
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        description: 'temp learning-layer fixture',
        tags: ['test'],
        scripts: { start: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' },
      })
    );
    fs.writeFileSync(
      path.join(dir, 'oneshot.json'),
      JSON.stringify({
        schemaVersion: 1,
        spec: {
          vision: 'Temp fixture vision.',
          createdAt: '2026-07-01T00:00:00.000Z',
          acceptance: { mode: 'human', script: 'verify', successExitCode: 0 },
        },
        attempts,
      })
    );
    return dir;
  }

  function fixtureAttempt(id, extra = {}) {
    return {
      id,
      timestamp: '2026-07-01T00:00:00.000Z',
      model: 'fixture-model',
      environment: { tool: '', toolBuild: '', os: '', osBuild: '' },
      build: { tokens: null, durationMs: null },
      evaluation: {
        method: 'none',
        fidelityScore: null,
        passed: null,
        feedback: '',
        evaluatedAt: null,
      },
      ...extra,
    };
  }

  async function postObs(payload) {
    const res = await fetch(`${DASHBOARD_URL}/api/manifest/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      rm(tempDirs.pop());
    }
  });

  afterAll(() => {
    // Temp fixtures are gone — regenerate LESSONS.md so the repo artifact
    // doesn't retain fixture entries after the suite.
    spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'generate-lessons.mjs')], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  });

  test('F15_1: GET /api/insights returns the aggregate shape', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/insights`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totals.oneShots).toBe('number');
    expect(Array.isArray(body.models)).toBe(true);
    expect(Array.isArray(body.matrix)).toBe(true);
    expect(Array.isArray(body.lessons)).toBe(true);
  });

  test('F15_2: observations require id and attemptId', async () => {
    expect((await postObs({})).status).toBe(400);
    expect((await postObs({ id: 'json-repair' })).status).toBe(400);
  });

  test('F15_3: unknown one-shot / attempt return 404', async () => {
    expect(
      (await postObs({ id: 'does-not-exist-xyz', attemptId: 'att_x', lessons: ['l'] })).status
    ).toBe(404);
    mkOneShot('temp-obs-404', []);
    expect(
      (await postObs({ id: 'temp-obs-404', attemptId: 'att_missing', lessons: ['l'] })).status
    ).toBe(404);
  });

  test('F15_4: observations save once, then 409 on rewrite', async () => {
    mkOneShot('temp-obs-once', [fixtureAttempt('att_fixture_1')]);

    const first = await postObs({
      id: 'temp-obs-once',
      attemptId: 'att_fixture_1',
      wentWell: ['fixture went well'],
      lessons: ['fixture lesson text'],
    });
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.observations.lessons[0]).toBe('fixture lesson text');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(oneShotsDir, 'temp-obs-once', 'oneshot.json'), 'utf8')
    );
    expect(manifest.attempts[0].observations.wentWell[0]).toBe('fixture went well');

    const second = await postObs({
      id: 'temp-obs-once',
      attemptId: 'att_fixture_1',
      lessons: ['attempted rewrite'],
    });
    expect(second.status).toBe(409);
    const reread = JSON.parse(
      fs.readFileSync(path.join(oneShotsDir, 'temp-obs-once', 'oneshot.json'), 'utf8')
    );
    expect(reread.attempts[0].observations.lessons[0]).toBe('fixture lesson text');
  });

  test('F15_5: invalid observation shapes return 400', async () => {
    mkOneShot('temp-obs-invalid', [fixtureAttempt('att_fixture_2')]);
    expect(
      (await postObs({ id: 'temp-obs-invalid', attemptId: 'att_fixture_2', lessons: 'not-a-list' }))
        .status
    ).toBe(400);
    expect(
      (await postObs({ id: 'temp-obs-invalid', attemptId: 'att_fixture_2', lessons: [] })).status
    ).toBe(400);
  });

  test('F15_6: an observation write regenerates LESSONS.md with the lesson', async () => {
    mkOneShot('temp-obs-lessons', [fixtureAttempt('att_fixture_3')]);
    const res = await postObs({
      id: 'temp-obs-lessons',
      attemptId: 'att_fixture_3',
      lessons: ['unique-e2e-lesson-marker-f15'],
    });
    expect(res.status).toBe(200);
    const md = fs.readFileSync(lessonsPath, 'utf8');
    expect(md.includes('unique-e2e-lesson-marker-f15')).toBe(true);
  });

  test('F15_7: insights reflect interaction + observations of a fixture attempt', async () => {
    mkOneShot('temp-obs-insights', [
      fixtureAttempt('att_fixture_4', {
        model: 'fixture-model-insights',
        interaction: { userPrompts: 1, oneShot: true, source: 'transcript' },
        observations: {
          wentWell: [],
          struggled: ['fixture struggle'],
          lessons: ['fixture insight lesson'],
          notedAt: '2026-07-01T00:00:00.000Z',
        },
      }),
    ]);
    const res = await fetch(`${DASHBOARD_URL}/api/insights`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const m = body.models.find((x) => x.model === 'fixture-model-insights');
    expect(m.oneShotRate).toBe(1);
    expect(m.topStruggles[0]).toBe('fixture struggle');
    const row = body.matrix.find((r) => r.oneShotId === 'temp-obs-insights');
    expect(row.cells['fixture-model-insights'].status).toBe('attempted');
    expect(row.cells['fixture-model-insights'].oneShot).toBe(true);
    const lesson = body.lessons.find((l) => l.text === 'fixture insight lesson');
    expect(lesson.oneShotId).toBe('temp-obs-insights');
  });
});
