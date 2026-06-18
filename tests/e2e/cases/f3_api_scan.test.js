const fs = require('fs');
const path = require('path');

describe('F3: Dashboard API Scan', () => {
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
    // Cleanup any registered temp dirs/files in case tests fail before cleaning up
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      if (fs.existsSync(p)) {
        if (fs.statSync(p).isDirectory()) {
          rmDirRecursive(p);
        } else {
          fs.unlinkSync(p);
        }
      }
    }
  });

  test('F3_1: GET /api/scan returns status 200', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    expect(res.status).toBe(200);
  });

  test('F3_2: GET /api/scan response has application/json content type', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType.includes('application/json')).toBe(true);
  });

  test('F3_3: GET /api/scan returns a JSON array', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('F3_4: GET /api/scan elements have required fields', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    if (data.length > 0) {
      const first = data[0];
      expect(typeof first.id).toBe('string');
      expect(typeof first.name).toBe('string');
      expect(typeof first.version).toBe('string');
      expect(typeof first.description).toBe('string');
      expect(Array.isArray(first.tags)).toBe(true);
      expect(typeof first.path).toBe('string');
    }
  });

  test('F3_5: GET /api/scan returns notion-scraper if implemented', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const scraperExists = fs.existsSync(path.join(oneShotsDir, 'notion-scraper'));
    const found = data.some((item) => item.id === 'notion-scraper');
    if (scraperExists) {
      expect(found).toBe(true);
    } else {
      // If scraper not implemented on disk, scanner shouldn't find it
      expect(found).toBe(false);
    }
  });

  test('F3_6: GET /api/scan dynamically scans new one-shots added to disk', async () => {
    const tempDirName = 'temp-scan-add-test';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath); // Ensure clean start

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      description: 'Temporary scan addition test',
      tags: ['temp', 'test'],
      main: 'index.js',
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempPath, 'index.js'), 'console.log("temp");', 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const found = data.some((item) => item.id === tempDirName);
    expect(found).toBe(true);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test('F3_7: GET /api/scan dynamically removes deleted one-shots', async () => {
    const tempDirName = 'temp-scan-del-test';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      description: 'Temporary scan deletion test',
      tags: ['temp'],
      main: 'index.js',
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Scan to verify it's there
    let res = await fetch(`${DASHBOARD_URL}/api/scan`);
    let data = await res.json();
    expect(data.some((item) => item.id === tempDirName)).toBe(true);

    // Delete it
    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);

    // Scan again to verify it is gone
    res = await fetch(`${DASHBOARD_URL}/api/scan`);
    data = await res.json();
    expect(data.some((item) => item.id === tempDirName)).toBe(false);
  });

  test('F3_8: GET /api/scan handles corrupt package.json gracefully', async () => {
    const tempDirName = 'temp-scan-corrupt-test';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    fs.writeFileSync(path.join(tempPath, 'package.json'), '{ invalid json: "" }', 'utf8');

    // Scanner should not crash, returns 200
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });

  test('F3_9: GET /api/scan ignores non-directory files in one-shots folder', async () => {
    const tempFilePath = path.join(oneShotsDir, 'temp-file-test.txt');
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    fs.writeFileSync(tempFilePath, 'This is a text file, not a directory', 'utf8');
    tempDirs.push(tempFilePath);

    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const found = data.some(
      (item) => item.id === 'temp-file-test' || item.name === 'temp-file-test.txt'
    );
    expect(found).toBe(false);

    fs.unlinkSync(tempFilePath);
    tempDirs.splice(tempDirs.indexOf(tempFilePath), 1);
  });

  test('F3_10: GET /api/scan ignores directories without package.json', async () => {
    const tempDirName = 'temp-no-pkg-test';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();
    const found = data.some((item) => item.id === tempDirName);
    expect(found).toBe(false);

    rmDirRecursive(tempPath);
    tempDirs.splice(tempDirs.indexOf(tempPath), 1);
  });
});
