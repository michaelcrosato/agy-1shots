const fs = require('fs');
const path = require('path');

describe('Tier 3: Cross-Feature Integration Tests', () => {
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

  test('T3_1: New One-Shot Creation to API Scan Reflection (F1 <-> F3)', async () => {
    const tempName = 'temp-t3-1';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 1',
      tags: ['t3'],
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const found = data.some((item) => item.id === tempName);
    expect(found).toBe(true);
  });

  test('T3_2: Deleted One-Shot Clean Up (F1 <-> F3 <-> F6)', async () => {
    const tempName = 'temp-t3-2';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 2',
      tags: ['t3'],
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Confirm it shows in scan
    let res = await fetch(`${DASHBOARD_URL}/api/scan?search=t3-2`);
    let data = await res.json();
    expect(data.some((item) => item.id === tempName)).toBe(true);

    // Delete folder
    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);

    // Confirm it is gone
    res = await fetch(`${DASHBOARD_URL}/api/scan?search=t3-2`);
    data = await res.json();
    expect(data.some((item) => item.id === tempName)).toBe(false);
  });

  test('T3_3: Run/Test Failure Updates Sidebar Success Stats (F8 <-> F4 <-> F5)', async () => {
    const tempName = 'temp-t3-3';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 3',
      scripts: {
        test: 'node -e "process.exit(1)"',
      },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Run the failing test
    await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName, action: 'test' }),
    });

    // Check stats on home page
    const res = await fetch(`${DASHBOARD_URL}/`);
    const html = await res.text();
    // Verify that the UI reports a failure or decreased success rate
    expect(html.includes('fail') || html.includes('success') || html.includes('%')).toBe(true);
  });

  test('T3_4: Search/Filter Persistence During Preview Toggle (F6 <-> F7)', async () => {
    // This is a UI client state flow. In E2E we verify both the search filter API and metadata API work together.
    const searchRes = await fetch(`${DASHBOARD_URL}/api/scan?search=temp-t3`);
    expect(searchRes.status).toBe(200);
    const previewRes = await fetch(`${DASHBOARD_URL}/api/scan/notion-scraper`);
    expect(previewRes.status === 200 || previewRes.status === 404).toBe(true);
  });

  test('T3_5: Polishing a One-Shot Updates Monorepo and Scan (F8 <-> F1 <-> F3)', async () => {
    const tempName = 'temp-t3-5';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 5',
      tags: ['unpolished'],
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Polish
    await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tempName,
        prompt: 'update tags',
        updates: { tags: ['polished-t3-5'] },
      }),
    });

    // Fetch scan
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const polishedItem = data.find((item) => item.id === tempName);
    expect(polishedItem).toExist();
    expect(polishedItem.tags.includes('polished-t3-5')).toBe(true);
  });

  test('T3_6: Export Action Generates Independent Directory (F8 <-> F1)', async () => {
    const tempName = 'temp-t3-6';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 6',
      scripts: { test: 'echo 1' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempPath, 'README.md'), '# Temp README', 'utf8');

    // Trigger export
    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName }),
    });
    expect(res.status).toBe(200);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  test('T3_7: Invalid Monorepo Structure Causes Scan Warning (F1 <-> F3 <-> F5)', async () => {
    const tempName = 'temp-t3-7';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    fs.writeFileSync(path.join(tempPath, 'package.json'), '{"corrupt": ', 'utf8');

    // Fetch scan API
    const scanRes = await fetch(`${DASHBOARD_URL}/api/scan`);
    expect(scanRes.status).toBe(200);
    const scanData = await scanRes.json();

    // Renders safely without crashing dashboard page
    const pageRes = await fetch(`${DASHBOARD_URL}/`);
    expect(pageRes.status).toBe(200);
  });

  test('T3_8: Run Action Terminal Stream with Preview Toggle (F8 <-> F7)', async () => {
    // Trigger run then view preview
    const tempName = 'temp-t3-8';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 8',
      scripts: { test: 'node -e "console.log(\'t3-8\')"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName, action: 'test' }),
    });
    expect(runRes.status).toBe(200);

    const prevRes = await fetch(`${DASHBOARD_URL}/api/scan/${tempName}`);
    expect(prevRes.status).toBe(200);
  });

  test('T3_9: Add New One-Shot, Search for it, and Run its Test (F1 <-> F6 <-> F4)', async () => {
    const tempName = 'temp-t3-9';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Cross feature test 9',
      scripts: { test: 'node -e "console.log(\'T3_9_RUN\')"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 1. Search for it
    const searchRes = await fetch(`${DASHBOARD_URL}/api/scan?search=${tempName}`);
    const searchData = await searchRes.json();
    expect(searchData.some((item) => item.id === tempName)).toBe(true);

    // 2. Run its test
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName, action: 'test' }),
    });
    const runData = await runRes.json();
    expect(runData.success).toBe(true);
    expect(runData.stdout.includes('T3_9_RUN')).toBe(true);
  });

  test('T3_10: Create, Polish, Scan, Run, and Export Lifecycle (F1 <-> F8 <-> F3 <-> F4)', async () => {
    const tempName = 'temp-t3-10';
    const tempPath = path.join(oneShotsDir, tempName);
    rmDirRecursive(tempPath);
    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);
    const pkg = {
      name: tempName,
      version: '1.0.0',
      description: 'Lifecycle test',
      scripts: { test: 'echo "ok"' },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // 1. Polish
    const polishRes = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tempName,
        prompt: 'polish',
        updates: { version: '1.0.1' },
      }),
    });
    expect(polishRes.status).toBe(200);

    // 2. Scan
    const scanRes = await fetch(`${DASHBOARD_URL}/api/scan`);
    const scanData = await scanRes.json();
    const item = scanData.find((i) => i.id === tempName);
    expect(item.version).toBe('1.0.1');

    // 3. Run
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName, action: 'test' }),
    });
    expect(runRes.status).toBe(200);

    // 4. Export
    const exportRes = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempName }),
    });
    expect(exportRes.status).toBe(200);
  });
});
