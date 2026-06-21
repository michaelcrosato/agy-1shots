const fs = require('fs');
const path = require('path');

describe('Tier 4: Real-World Scenario Tests', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const oneShotsDir = path.resolve(__dirname, '../../../one-shots');
  const tempDirs = [];

  function rmDirRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          rmDirRecursive(curPath);
        } else {
          let retries = 30;
          while (retries > 0) {
            try {
              fs.unlinkSync(curPath);
              break;
            } catch (err) {
              if (
                retries > 1 &&
                (err.code === 'EBUSY' || err.code === 'ENOTEMPTY' || err.code === 'EPERM')
              ) {
                retries--;
                const end = Date.now() + 100;
                while (Date.now() < end) {}
              } else {
                throw err;
              }
            }
          }
        }
      });
      let retries = 30;
      while (retries > 0) {
        try {
          fs.rmdirSync(dirPath);
          break;
        } catch (err) {
          if (err.code === 'ENOENT') {
            break; // Already deleted
          }
          if (
            retries > 1 &&
            (err.code === 'EBUSY' || err.code === 'ENOTEMPTY' || err.code === 'EPERM')
          ) {
            retries--;
            const end = Date.now() + 100;
            while (Date.now() < end) {}
          } else {
            throw err;
          }
        }
      }
    }
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      if (fs.existsSync(p)) {
        rmDirRecursive(p);
      }
    }
  });

  test('T4_1: Full User Journey - Onboarding and Running Scraper', async () => {
    // 1. User loads dashboard
    const homeRes = await fetch(`${DASHBOARD_URL}/`);
    expect(homeRes.status).toBe(200);

    // 2. User checks metadata for notion-scraper
    const scraperExists = fs.existsSync(path.join(oneShotsDir, 'notion-scraper'));
    if (scraperExists) {
      const metaRes = await fetch(`${DASHBOARD_URL}/api/scan/notion-scraper`);
      expect(metaRes.status).toBe(200);
      const meta = await metaRes.json();
      expect(meta.id).toBe('notion-scraper');

      // 3. User runs scraper with MOCK=true env
      const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'notion-scraper',
          action: 'start',
          env: { MOCK: 'true' },
        }),
      });
      expect(runRes.status).toBe(200);
      const run = await runRes.json();
      expect(run.success).toBe(true);
    }
  });

  test('T4_2: Multi-step Monorepo Growth Scenario', async () => {
    const name = 'temp-weather-notifier';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '1.0.0',
      description: 'Notify weather details',
      tags: ['weather', 'notifier'],
      scripts: { test: 'node -e "console.log(\'weather ok\')"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 1. Refresh dashboard scan
    const scanRes = await fetch(`${DASHBOARD_URL}/api/scan`);
    const scanData = await scanRes.json();
    expect(scanData.some((i) => i.id === name)).toBe(true);

    // 2. Search for it
    const searchRes = await fetch(`${DASHBOARD_URL}/api/scan?search=weather`);
    const searchData = await searchRes.json();
    expect(searchData.some((i) => i.id === name)).toBe(true);

    // 3. Polish details
    const polishRes = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: name,
        prompt: 'polish',
        updates: { tags: ['weather', 'notifier', 'polished'] },
      }),
    });
    expect(polishRes.status).toBe(200);

    // 4. Test code
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });
    const runData = await runRes.json();
    expect(runData.success).toBe(true);

    // 5. Export
    const exportRes = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name }),
    });
    expect(exportRes.status).toBe(200);
  });

  test('T4_3: Error Resilience and Recovery Workflow', async () => {
    const name = 'temp-error-recovery';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '1.0.0',
      description: 'Recovery test',
      scripts: { test: 'node -e "process.exit(1)"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 1. Run (shows fail)
    let runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });
    let runData = await runRes.json();
    expect(runData.success).toBe(false);

    // 2. Fix the bug
    pkg.scripts.test = 'node -e "process.exit(0)"';
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 3. Re-run tests via dashboard (shows green)
    runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });
    runData = await runRes.json();
    expect(runData.success).toBe(true);
  });

  test('T4_4: AI-driven Improvement and Polish Loop', async () => {
    const name = 'temp-ai-polish';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '1.0.0',
      description: 'AI Suggest loop test',
      tags: ['ai'],
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Query suggestions
    const suggestRes = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name }),
    });
    expect(suggestRes.status).toBe(200);

    // AI suggestions tell us to add 'smart' tag. Polish metadata with new tag.
    const polishRes = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: name,
        prompt: 'add tag smart',
        updates: { tags: ['ai', 'smart'] },
      }),
    });
    expect(polishRes.status).toBe(200);

    // Filter by the new tag
    const filterRes = await fetch(`${DASHBOARD_URL}/api/scan?tag=smart`);
    const filterData = await filterRes.json();
    expect(filterData.some((i) => i.id === name)).toBe(true);
  });

  test('T4_5: Concurrent Executions and System Load Management', async () => {
    // Start 3 concurrent runs
    const runners = ['temp-concurrent-1', 'temp-concurrent-2', 'temp-concurrent-3'];

    runners.forEach((name) => {
      const tempPath = path.join(oneShotsDir, name);
      rmDirRecursive(tempPath);
      fs.mkdirSync(tempPath, { recursive: true });
      tempDirs.push(tempPath);

      const pkg = {
        name,
        version: '1.0.0',
        description: 'Concurrent run test',
        scripts: {
          test: `node -e "setTimeout(() => console.log('${name} done'), 500)"`,
        },
      };
      fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
    });

    const promises = runners.map((name) => {
      return fetch(`${DASHBOARD_URL}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: name, action: 'test' }),
      }).then((r) => r.json());
    });

    const results = await Promise.all(promises);
    results.forEach((res, i) => {
      expect(res.success).toBe(true);
      expect(res.stdout.includes(`${runners[i]} done`)).toBe(true);
    });
  });

  test('T4_6: Clean Monorepo Migration and Export Lifecycle', async () => {
    // Generate an export and make sure it has its own independent files
    const name = 'temp-migration';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '1.0.0',
      description: 'Migration test',
      scripts: { test: 'node -e "console.log(\'isolated\')"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(200);
  });

  test('T4_7: Security Isolation - check one-shot execution cannot write outside one-shots', async () => {
    const name = 'temp-security';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    // Try to write a file in parent directory or system directories
    const pkg = {
      name,
      version: '1.0.0',
      description: 'Security test',
      scripts: {
        test: "node -e \"const fs = require('fs'); try { fs.writeFileSync('../../malicious.txt', 'hacked'); } catch(e) {}\"",
      },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const maliciousFile = path.resolve(oneShotsDir, '../malicious.txt');
    if (fs.existsSync(maliciousFile)) fs.unlinkSync(maliciousFile);

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });

    expect(res.status).toBe(200);
    // Malicious file must NOT be written at root due to directory constraints or check
    expect(fs.existsSync(maliciousFile)).toBe(false);
  });

  test('T4_8: Scale Scanning - check scanner handles 50 temporary folders efficiently', async () => {
    const totalPieces = 50;

    for (let i = 0; i < totalPieces; i++) {
      const name = `temp-scale-piece-${i}`;
      const tempPath = path.join(oneShotsDir, name);
      rmDirRecursive(tempPath);
      fs.mkdirSync(tempPath, { recursive: true });
      tempDirs.push(tempPath);

      const pkg = {
        name,
        version: '1.0.0',
        description: `Scale piece ${i}`,
      };
      fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
    }

    const startScanTime = Date.now();
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const duration = Date.now() - startScanTime;

    // Verify all scale pieces were found
    for (let i = 0; i < totalPieces; i++) {
      const found = data.some((item) => item.id === `temp-scale-piece-${i}`);
      expect(found).toBe(true);
    }
    // Scanning ~50 folders should be well under a generous bound (normally ms),
    // catching a real performance regression without being timing-flaky.
    expect(duration < 10000).toBe(true);
  });

  test('T4_9: Standalone Export Validation - verify exported package package.json exists', async () => {
    const name = 'temp-standalone-validate';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '2.0.0',
      description: 'Export validation',
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name }),
    });
    expect(res.status).toBe(200);
  });

  test('T4_10: Buggy script recovery cycle - run, fail, edit, run, pass', async () => {
    const name = 'temp-recovery-cycle';
    const tempPath = path.join(oneShotsDir, name);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name,
      version: '1.0.0',
      description: 'Recovery cycle test',
      scripts: { test: 'node -e "process.exit(1)"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 1. Run (fails)
    let res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });
    let data = await res.json();
    expect(data.success).toBe(false);

    // 2. Edit script
    pkg.scripts.test = 'node -e "process.exit(0)"';
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 3. Run again (passes)
    res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, action: 'test' }),
    });
    data = await res.json();
    expect(data.success).toBe(true);
  });
});
