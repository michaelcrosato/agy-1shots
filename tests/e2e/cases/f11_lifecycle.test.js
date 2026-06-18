const fs = require('fs');
const path = require('path');

// "Eat your own dog food": a benchmarking tool must validate itself with an
// automated test, not a manual smoke check. This drives the full intended
// lifecycle through the real HTTP API end-to-end.
describe('F11: Full one-shot lifecycle (vision -> attempt -> verify -> summary)', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const oneShotsDir = path.resolve(__dirname, '../../../one-shots');
  const name = 'temp-f11-lifecycle';
  const tempPath = path.join(oneShotsDir, name);

  function rmDirRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    let attempts = 0;
    while (attempts < 5) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        break;
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'EBUSY') {
          attempts++;
          if (attempts >= 5) throw err;
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
          } catch (e) {
            const start = Date.now();
            while (Date.now() - start < 100) {}
          }
        } else {
          throw err;
        }
      }
    }
  }

  afterEach(() => rmDirRecursive(tempPath));

  async function postJson(url, body) {
    const res = await fetch(`${DASHBOARD_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  test('F11_1: a one-shot can be created, specced, attempted, verified, and reflected in the scan', async () => {
    // 1. Create a one-shot with a real, runnable acceptance test.
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    fs.writeFileSync(
      path.join(tempPath, 'package.json'),
      JSON.stringify(
        {
          name,
          version: '1.0.0',
          scripts: { verify: 'node -e "process.exit(0)"' },
        },
        null,
        2
      ),
      'utf8'
    );

    // 2. Set the write-once vision (program-evaluated).
    const spec = await postJson('/api/manifest/spec', {
      id: name,
      vision: 'Return the sum of two numbers.',
      acceptance: { mode: 'program' },
    });
    expect(spec.res.status).toBe(200);

    // 3. Record a build attempt with cost + model + environment.
    const attempt = await postJson('/api/manifest/attempt', {
      id: name,
      model: 'Gemini 3.5 Flash (high)',
      environment: { tool: 'Antigravity', toolBuild: '1.0', os: 'Windows 11', osBuild: '22631' },
      build: { tokens: 4200, durationMs: 53000 },
    });
    expect(attempt.res.status).toBe(200);
    const attemptId = attempt.data.attempt.id;
    expect(typeof attemptId).toBe('string');

    // 4. Run the acceptance test and record the objective result onto it.
    const verify = await postJson('/api/manifest/verify', { id: name, attemptId });
    expect(verify.res.status).toBe(200);
    expect(verify.data.passed).toBe(true);
    expect(verify.data.recorded).toBe(true);

    // 5. The full manifest reflects the whole history.
    const manifestRes = await fetch(`${DASHBOARD_URL}/api/scan/${name}/manifest`);
    const manifest = await manifestRes.json();
    expect(manifest.spec.vision).toBe('Return the sum of two numbers.');
    expect(manifest.manifestStatus).toBe('valid');
    expect(manifest.attempts.length).toBe(1);
    expect(manifest.attempts[0].evaluation.method).toBe('program');
    expect(manifest.attempts[0].evaluation.passed).toBe(true);
    expect(manifest.attempts[0].build.tokens).toBe(4200);

    // 6. The scan card summary reflects the latest pass + model.
    const scanRes = await fetch(`${DASHBOARD_URL}/api/scan`);
    const scan = await scanRes.json();
    const card = scan.find((i) => i.id === name);
    expect(card).toExist();
    expect(card.manifest.hasVision).toBe(true);
    expect(card.manifest.latestPassed).toBe(true);
    expect(card.manifest.latestModel).toBe('Gemini 3.5 Flash (high)');
  });
});
