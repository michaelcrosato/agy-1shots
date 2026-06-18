const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Tier 5: White-Box Adversarial Hardening', () => {
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
            break;
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

  // T5_1: /api/scan/[id] crash resilience with null package.json
  test('T5_1: /api/scan/[id] crash resilience with null package.json', async () => {
    const tempDirName = 'temp-t5-null-pkg';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    // Write a package.json containing JSON null
    fs.writeFileSync(path.join(tempPath, 'package.json'), 'null', 'utf8');

    // Query scan ID endpoint - should handle null gracefully without throwing TypeError (500 status)
    const res = await fetch(`${DASHBOARD_URL}/api/scan/${tempDirName}`);
    expect(res.status === 200 || res.status === 404).toBe(true);

    if (res.status === 200) {
      const data = await res.json();
      expect(data.name).toBe(tempDirName); // Fell back to folder ID
    }
  });

  // T5_2: /api/polish value type validation for version/description/tags
  test('T5_2: /api/polish value type validation to prevent package.json corruption', async () => {
    const tempDirName = 'temp-t5-type-validation';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      description: 'Before polish',
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Send polish request with invalid type value for tags (string instead of array)
    const resStrTags = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tempDirName,
        prompt: 'Add invalid tags',
        updates: { tags: 'not-an-array' },
      }),
    });
    // Should be rejected as Bad Request due to value type validation
    expect(resStrTags.status).toBe(400);

    // Send polish request with invalid type value for version (object instead of string)
    const resObjVer = await fetch(`${DASHBOARD_URL}/api/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tempDirName,
        prompt: 'Add invalid version',
        updates: { version: { major: 1 } },
      }),
    });
    expect(resObjVer.status).toBe(400);
  });

  // T5_3: /api/run command injection bypass with absolute path arguments
  test('T5_3: /api/run command injection bypass with absolute path arguments', async () => {
    const tempDirName = 'temp-t5-cmd-abs';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    // Absolute path argument bypass
    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      scripts: {
        // cmd is "node C:\outside.js", path.isAbsolute(cmd) is false
        start: 'node C:\\some\\outside\\path\\script.js',
      },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempDirName, action: 'start' }),
    });

    const data = await res.json();
    // It should be blocked as a security violation!
    expect(data.success).toBe(false);
    expect(data.stderr && data.stderr.includes('Security violation')).toBe(true);
  });

  // T5_4: /api/run command injection bypass with nested env variable paths
  test('T5_4: /api/run command injection bypass with absolute root prefix', async () => {
    const tempDirName = 'temp-t5-cmd-env';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    // Absolute root prefix path bypass (doesn't contain '..' or drive letter 'C:')
    // E.g., 'node \dev\agy-1shots\dashboard\next.config.mjs'
    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      scripts: {
        start: 'node \\dev\\agy-1shots\\dashboard\\next.config.mjs',
      },
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    const res = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempDirName, action: 'start' }),
    });

    const data = await res.json();
    // It should be blocked as a security violation!
    expect(data.success).toBe(false);
    expect(data.stderr && data.stderr.includes('Security violation')).toBe(true);
  });

  // T5_5: /api/export symlink traversal prevention
  test('T5_5: /api/export symlink traversal prevention', async () => {
    const tempDirName = 'temp-t5-export-symlink';
    const tempPath = path.join(oneShotsDir, tempDirName);
    rmDirRecursive(tempPath);

    fs.mkdirSync(tempPath, { recursive: true });
    tempDirs.push(tempPath);

    const pkg = {
      name: tempDirName,
      version: '1.0.0',
      description: 'Export symlink test',
    };
    fs.writeFileSync(path.join(tempPath, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

    // Create a symlink to outside the one-shot folder (e.g. target dashboard directory)
    const symlinkPath = path.join(tempPath, 'dashboard-link');
    const outsideTarget = path.resolve(oneShotsDir, '../dashboard');

    try {
      fs.symlinkSync(outsideTarget, symlinkPath, 'junction');
    } catch (e) {
      console.log('Skipping symlink creation: ', e.message);
      return;
    }

    const res = await fetch(`${DASHBOARD_URL}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tempDirName }),
    });

    expect(res.status).toBe(200);
    const buffer = await res.arrayBuffer();
    // If the symlink was followed, the ZIP file size will be huge.
    // It should be small because it should only contain package.json and not the entire dashboard folder.
    expect(buffer.byteLength > 0).toBe(true);
    expect(buffer.byteLength < 100000).toBe(true); // dashboard folder is much larger
  });
});
