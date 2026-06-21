/**
 * Empirical Verification Tests for Dashboard App
 * Path: c:\dev\agy-1shots\tests\empirical_verify.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DASHBOARD_URL = 'http://localhost:3000';
const oneShotsDir = path.resolve(__dirname, '../one-shots');

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
              while (Date.now() < end) {
                /* busy-wait */
              }
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
          while (Date.now() < end) {
            /* busy-wait */
          }
        } else {
          throw err;
        }
      }
    }
  }
}

async function runTests() {
  console.log('=== STARTING EMPIRICAL VERIFICATION TESTS ===\n');

  // ==========================================
  // Check 1: Malformed Metadata (Poison Pill)
  // ==========================================
  console.log('--- Check 1: Malformed Metadata Resilience ---');

  const invalidTagsDir = path.join(oneShotsDir, 'temp-invalid-tags');
  const invalidNameDir = path.join(oneShotsDir, 'temp-invalid-name');
  const invalidDescDir = path.join(oneShotsDir, 'temp-invalid-desc');

  rmDirRecursive(invalidTagsDir);
  rmDirRecursive(invalidNameDir);
  rmDirRecursive(invalidDescDir);

  fs.mkdirSync(invalidTagsDir, { recursive: true });
  fs.mkdirSync(invalidNameDir, { recursive: true });
  fs.mkdirSync(invalidDescDir, { recursive: true });

  fs.writeFileSync(
    path.join(invalidTagsDir, 'package.json'),
    JSON.stringify({
      name: 'temp-invalid-tags',
      version: '1.0.0',
      tags: 'not-an-array-should-be-ignored',
    }),
    'utf8'
  );

  fs.writeFileSync(
    path.join(invalidNameDir, 'package.json'),
    JSON.stringify({
      name: { first: 'invalid', last: 'object' },
      version: '1.0.0',
      tags: ['valid-tag'],
    }),
    'utf8'
  );

  fs.writeFileSync(
    path.join(invalidDescDir, 'package.json'),
    JSON.stringify({
      name: 'temp-invalid-desc',
      version: '1.0.0',
      description: 999999,
    }),
    'utf8'
  );

  try {
    // 1. Fetch scan endpoint
    console.log('Fetching /api/scan...');
    const scanRes = await fetch(`${DASHBOARD_URL}/api/scan`);
    if (scanRes.status !== 200) {
      throw new Error(`Expected /api/scan status 200, got ${scanRes.status}`);
    }
    const scanData = await scanRes.json();
    console.log('  /api/scan returned status 200 OK');

    // Find and check our packages
    const pkgTags = scanData.find((p) => p.id === 'temp-invalid-tags');
    const pkgName = scanData.find((p) => p.id === 'temp-invalid-name');
    const pkgDesc = scanData.find((p) => p.id === 'temp-invalid-desc');

    if (!pkgTags) throw new Error('Could not find temp-invalid-tags in scan results');
    if (!pkgName) throw new Error('Could not find temp-invalid-name in scan results');
    if (!pkgDesc) throw new Error('Could not find temp-invalid-desc in scan results');

    if (!Array.isArray(pkgTags.tags) || pkgTags.tags.length !== 0) {
      throw new Error(
        `Expected temp-invalid-tags tags to be empty array, got: ${JSON.stringify(pkgTags.tags)}`
      );
    }
    console.log('  [PASS] Invalid tags converted to empty array');

    if (pkgName.name !== 'temp-invalid-name') {
      throw new Error(
        `Expected temp-invalid-name name to fall back to folder ID, got: ${JSON.stringify(pkgName.name)}`
      );
    }
    console.log('  [PASS] Invalid name fell back to directory name');

    if (pkgDesc.description !== '') {
      throw new Error(
        `Expected temp-invalid-desc description to fall back to empty string, got: ${JSON.stringify(pkgDesc.description)}`
      );
    }
    console.log('  [PASS] Invalid description fell back to empty string');

    // 2. Fetch homepage
    console.log('Fetching homepage /...');
    const homeRes = await fetch(`${DASHBOARD_URL}/`);
    if (homeRes.status !== 200) {
      throw new Error(`Expected homepage / status 200, got ${homeRes.status}`);
    }
    console.log('  [PASS] Homepage returned status 200 OK (no crash on rendering)');
  } finally {
    rmDirRecursive(invalidTagsDir);
    rmDirRecursive(invalidNameDir);
    rmDirRecursive(invalidDescDir);
  }

  // ==========================================
  // Check 2: Infinite Loop Timeout
  // ==========================================
  console.log('\n--- Check 2: Infinite Loop Timeout ---');

  const loopDir = path.join(oneShotsDir, 'temp-infinite-loop');
  rmDirRecursive(loopDir);
  fs.mkdirSync(loopDir, { recursive: true });

  fs.writeFileSync(
    path.join(loopDir, 'package.json'),
    JSON.stringify({
      name: 'temp-infinite-loop',
      version: '1.0.0',
      scripts: {
        start: 'node loop.js',
      },
    }),
    'utf8'
  );

  fs.writeFileSync(
    path.join(loopDir, 'loop.js'),
    `
    console.log('Loop started');
    setInterval(() => {
      // Keeps process alive
    }, 500);
  `,
    'utf8'
  );

  try {
    console.log('Triggering run request with 1.5s timeout...');
    const startTime = Date.now();
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'temp-infinite-loop',
        action: 'start',
        timeout: 1500,
      }),
    });

    const elapsed = Date.now() - startTime;
    if (runRes.status !== 200) {
      throw new Error(`Expected /api/run status 200, got ${runRes.status}`);
    }

    const runData = await runRes.json();
    console.log('  API Response:', runData);
    console.log(`  Elapsed time: ${elapsed}ms`);

    if (runData.success !== false) {
      throw new Error('Expected success to be false');
    }
    if (runData.exitCode !== null) {
      throw new Error(`Expected exitCode to be null, got: ${runData.exitCode}`);
    }
    if (!runData.error || !runData.error.includes('timeout')) {
      throw new Error(`Expected error to contain "timeout", got: ${runData.error}`);
    }
    if (elapsed < 1400 || elapsed > 4000) {
      throw new Error(`Expected execution time to be close to 1.5s, got: ${elapsed}ms`);
    }
    console.log('  [PASS] Infinite loop correctly timed out and returned expected error structure');

    // Verify no process is left behind (on Windows)
    if (process.platform === 'win32') {
      try {
        const procList = execSync(
          'wmic process where "name=\'node.exe\'" get commandline,processid'
        ).toString();
        if (procList.includes('loop.js')) {
          throw new Error('Process loop.js is still running in the background!');
        }
        console.log('  [PASS] Process tree was successfully cleaned up (no zombie process)');
      } catch (e) {
        if (e.message.includes('No Instance(s) Available')) {
          console.log('  [PASS] Process tree was successfully cleaned up (no node processes)');
        } else {
          console.log(`  (Note: could not run wmic check: ${e.message})`);
        }
      }
    }
  } finally {
    rmDirRecursive(loopDir);
  }

  // ==========================================
  // Check 3: RCE Payloads Blocked
  // ==========================================
  console.log('\n--- Check 3: RCE Payloads Blocked ---');

  // A. Script Injection via Polish
  console.log('Testing Polish endpoint injection (scripts key)...');
  const polishRes = await fetch(`${DASHBOARD_URL}/api/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'notion-scraper',
      prompt: 'inject',
      updates: {
        scripts: { start: 'echo hacked' },
      },
    }),
  });
  console.log(`  Polish scripts status: ${polishRes.status}`);
  if (polishRes.status !== 400) {
    throw new Error(`Expected polish script injection to return 400, got ${polishRes.status}`);
  }
  const polishData = await polishRes.json();
  console.log('  Polish scripts error response:', polishData);
  if (!polishData.error || !polishData.error.includes('not allowed')) {
    throw new Error(
      `Expected error message to complain about key not allowed, got: ${polishData.error}`
    );
  }
  console.log('  [PASS] Modification of scripts key via /api/polish is blocked');

  // B. Prototype Pollution via Polish
  console.log('Testing Polish endpoint prototype pollution...');
  const protoRes = await fetch(`${DASHBOARD_URL}/api/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"id":"notion-scraper","prompt":"pollute","updates":{"__proto__":{"polluted":true}}}',
  });
  console.log(`  Polish proto status: ${protoRes.status}`);
  if (protoRes.status !== 400) {
    throw new Error(`Expected polish prototype pollution to return 400, got ${protoRes.status}`);
  }
  const protoData = await protoRes.json();
  console.log('  Polish proto error response:', protoData);
  if (!protoData.error || !protoData.error.includes('Prototype pollution')) {
    throw new Error(
      `Expected error message to mention prototype pollution, got: ${protoData.error}`
    );
  }
  console.log('  [PASS] Prototype pollution via /api/polish is blocked');

  // C. Escape command boundary with relative traversal
  console.log('Testing Command Traversal Escape...');
  const escapeCmdDir = path.join(oneShotsDir, 'temp-escape-cmd');
  rmDirRecursive(escapeCmdDir);
  fs.mkdirSync(escapeCmdDir, { recursive: true });

  fs.writeFileSync(
    path.join(escapeCmdDir, 'package.json'),
    JSON.stringify({
      name: 'temp-escape-cmd',
      version: '1.0.0',
      scripts: {
        start: 'node ../../outside.js',
      },
    }),
    'utf8'
  );

  try {
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'temp-escape-cmd',
        action: 'start',
      }),
    });
    const runData = await runRes.json();
    console.log('  Escape command relative response:', runData);
    if (runData.success !== false || !runData.stderr.includes('Security violation')) {
      throw new Error(
        `Expected relative path traversal command to be blocked, got success: ${runData.success}`
      );
    }
    console.log('  [PASS] Command traversal via relative path is blocked');
  } finally {
    rmDirRecursive(escapeCmdDir);
  }

  // D. Escape command boundary with absolute path
  console.log('Testing Command Absolute Path Escape...');
  const escapeAbsDir = path.join(oneShotsDir, 'temp-escape-abs');
  rmDirRecursive(escapeAbsDir);
  fs.mkdirSync(escapeAbsDir, { recursive: true });

  fs.writeFileSync(
    path.join(escapeAbsDir, 'package.json'),
    JSON.stringify({
      name: 'temp-escape-abs',
      version: '1.0.0',
      scripts: {
        start: 'C:\\some\\path',
      },
    }),
    'utf8'
  );

  try {
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'temp-escape-abs',
        action: 'start',
      }),
    });
    const runData = await runRes.json();
    console.log('  Escape command absolute response:', runData);
    if (runData.success !== false || !runData.stderr.includes('Security violation')) {
      throw new Error(
        `Expected absolute path command to be blocked, got success: ${runData.success}`
      );
    }
    console.log('  [PASS] Command execution with absolute path is blocked');
  } finally {
    rmDirRecursive(escapeAbsDir);
  }

  // E. Dangerous Env Keys stripping
  console.log('Testing Env Key Stripping...');
  const envTestDir = path.join(oneShotsDir, 'temp-env-test');
  rmDirRecursive(envTestDir);
  fs.mkdirSync(envTestDir, { recursive: true });

  fs.writeFileSync(
    path.join(envTestDir, 'package.json'),
    JSON.stringify({
      name: 'temp-env-test',
      version: '1.0.0',
      scripts: {
        start: 'node env_check.js',
      },
    }),
    'utf8'
  );

  fs.writeFileSync(
    path.join(envTestDir, 'env_check.js'),
    `
    console.log(JSON.stringify({
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      SAFE_VAR: process.env.SAFE_VAR
    }));
  `,
    'utf8'
  );

  try {
    const runRes = await fetch(`${DASHBOARD_URL}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'temp-env-test',
        action: 'start',
        env: {
          NODE_OPTIONS: '--max-old-space-size=4096',
          SAFE_VAR: 'hello-world',
        },
      }),
    });

    const runData = await runRes.json();
    console.log('  Env strip response:', runData);
    const envOutput = JSON.parse(runData.stdout.trim());
    console.log('  Parsed script environment output:', envOutput);

    if (envOutput.SAFE_VAR !== 'hello-world') {
      throw new Error(`Expected SAFE_VAR to be hello-world, got: ${envOutput.SAFE_VAR}`);
    }
    if (envOutput.NODE_OPTIONS && envOutput.NODE_OPTIONS.includes('--max-old-space-size=4096')) {
      throw new Error(
        `Expected NODE_OPTIONS to be stripped/ignored, got: ${envOutput.NODE_OPTIONS}`
      );
    }
    console.log('  [PASS] Dangerous environment keys (like NODE_OPTIONS) are stripped');
  } finally {
    rmDirRecursive(envTestDir);
  }

  console.log('\n=== ALL EMPIRICAL VERIFICATION TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch((err) => {
  console.error('\n✗ TEST RUNNER CRASHED WITH ERROR:', err);
  process.exit(1);
});
