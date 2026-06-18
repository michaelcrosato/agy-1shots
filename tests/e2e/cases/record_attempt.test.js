const fs = require('fs');
const path = require('path');
const cp = require('child_process');

describe('Milestone 3.5: Record Attempt CLI Script', () => {
  const repoRoot = path.resolve(__dirname, '../../../');
  const recordAttemptScript = path.join(repoRoot, 'scripts', 'record-attempt.js');
  const testOneShotId = 'test-record-attempt-temp';
  const testOneShotDir = path.join(repoRoot, 'one-shots', testOneShotId);
  const manifestPath = path.join(testOneShotDir, 'oneshot.json');
  const packagePath = path.join(testOneShotDir, 'package.json');

  const tempJsonLogPath = path.join(__dirname, 'temp_log.json');
  const tempTextLogPath = path.join(__dirname, 'temp_log.txt');
  const tempGenericTextLogPath = path.join(__dirname, 'temp_generic_log.txt');

  beforeAll(() => {
    // Set up test one-shot directory
    if (!fs.existsSync(testOneShotDir)) {
      fs.mkdirSync(testOneShotDir, { recursive: true });
    }

    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: {
          mode: 'human',
        },
      },
      attempts: [],
    };

    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    const mockPackage = {
      name: testOneShotId,
      version: '1.0.0',
      description: 'Mock one-shot for E2E testing of record-attempt CLI',
      scripts: {
        start: 'echo start',
        test: 'echo test',
      },
    };

    fs.writeFileSync(packagePath, JSON.stringify(mockPackage, null, 2), 'utf8');
  });

  afterAll(() => {
    // Clean up temporary files
    const filesToClean = [tempJsonLogPath, tempTextLogPath, tempGenericTextLogPath];
    for (const f of filesToClean) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    // Clean up scaffolded directory
    if (fs.existsSync(testOneShotDir)) {
      let attempts = 0;
      while (attempts < 5) {
        try {
          fs.rmSync(testOneShotDir, { recursive: true, force: true });
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
  });

  // Test 1: Path traversal and non-existent IDs
  test('CLI_RECORD_1: Fails on path traversal in ID', () => {
    const res = cp.spawnSync('node', [recordAttemptScript, '--id', '../dashboard'], {
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('Path traversal') || res.stderr.includes('invalid')).toBe(true);
  });

  test('CLI_RECORD_2: Fails on non-existent ID', () => {
    const res = cp.spawnSync('node', [recordAttemptScript, '--id', 'non-existent-oneshot-id'], {
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('directory not found') || res.stderr.includes('not found')).toBe(
      true
    );
  });

  test('CLI_RECORD_3: Fails when --id is missing', () => {
    const res = cp.spawnSync('node', [recordAttemptScript], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('required')).toBe(true);
  });

  // Test 2: Invalid token/arguments validation
  test('CLI_RECORD_4: Fails on non-integer numeric arguments', () => {
    const res = cp.spawnSync(
      'node',
      [recordAttemptScript, '--id', testOneShotId, '--build-tokens', '10.5'],
      { encoding: 'utf8' }
    );
    expect(res.status).toBe(1);
    expect(res.stderr.includes('Must be a non-negative integer')).toBe(true);
  });

  test('CLI_RECORD_5: Fails on negative numeric arguments', () => {
    const res = cp.spawnSync(
      'node',
      [recordAttemptScript, '--id', testOneShotId, '--build-time=-200'],
      { encoding: 'utf8' }
    );
    expect(res.status).toBe(1);
    expect(res.stderr.includes('Must be a non-negative integer')).toBe(true);
  });

  test('CLI_RECORD_6: Fails on non-numeric value in numeric arguments', () => {
    const res = cp.spawnSync(
      'node',
      [recordAttemptScript, '--id', testOneShotId, '--build-tokens', 'abc'],
      { encoding: 'utf8' }
    );
    expect(res.status).toBe(1);
    expect(res.stderr.includes('Must be a non-negative integer')).toBe(true);
  });

  // Test 3: Successful recording with env info
  test('CLI_RECORD_7: Successfully records attempt with correct properties and environment info', () => {
    // Reset oneshot.json before test
    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: { mode: 'human' },
      },
      attempts: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    const res = cp.spawnSync(
      'node',
      [
        recordAttemptScript,
        '--id',
        testOneShotId,
        '--model',
        'test-model-7',
        '--tool',
        'test-tool-7',
        '--tool-build',
        '1.2.3',
        '--build-tokens',
        '150',
        '--build-time',
        '300',
      ],
      { encoding: 'utf8' }
    );

    expect(res.status).toBe(0);

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.spec.vision).toBe('A mock vision for E2E testing of record-attempt.');
    expect(updated.attempts.length).toBe(1);

    const attempt = updated.attempts[0];
    expect(attempt.id.startsWith('att_')).toBe(true);
    expect(attempt.model).toBe('test-model-7');
    expect(attempt.environment.tool).toBe('test-tool-7');
    expect(attempt.environment.toolBuild).toBe('1.2.3');
    expect(typeof attempt.environment.os).toBe('string');
    expect(attempt.environment.os.length > 0).toBe(true);
    expect(typeof attempt.environment.osBuild).toBe('string');
    expect(attempt.environment.osBuild.length > 0).toBe(true);
    expect(attempt.build.tokens).toBe(150);
    expect(attempt.build.durationMs).toBe(300);
  });

  // Test 4: JSON/text log parsing with CLI overrides
  test('CLI_RECORD_8: Correctly parses JSON session-log and overrides with CLI options', () => {
    // Reset manifest attempts
    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: { mode: 'human' },
      },
      attempts: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    // Write temp JSON log
    const jsonLogContent = {
      build: {
        promptTokens: 1000,
        completionTokens: 500,
        durationMs: 5000,
      },
      model: 'gpt-4-log',
      tool: 'tool-log',
      toolBuild: '9.9.9',
    };
    fs.writeFileSync(tempJsonLogPath, JSON.stringify(jsonLogContent, null, 2), 'utf8');

    const res = cp.spawnSync(
      'node',
      [
        recordAttemptScript,
        '--id',
        testOneShotId,
        '--session-log',
        tempJsonLogPath,
        '--model',
        'cli-override-model',
        '--build-tokens',
        '999',
      ],
      { encoding: 'utf8' }
    );

    expect(res.status).toBe(0);

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.attempts.length).toBe(1);

    const attempt = updated.attempts[0];
    // Overridden by CLI:
    expect(attempt.model).toBe('cli-override-model');
    expect(attempt.build.tokens).toBe(999);
    // Inherited from JSON session-log:
    expect(attempt.environment.tool).toBe('tool-log');
    expect(attempt.environment.toolBuild).toBe('9.9.9');
    expect(attempt.build.durationMs).toBe(5000);
  });

  test('CLI_RECORD_9: Correctly parses text session-log and overrides with CLI options', () => {
    // Reset manifest attempts
    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: { mode: 'human' },
      },
      attempts: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    // Write temp text log
    const textLogContent = `
Some unstructured log details
build tokens: 550
build duration: 2500ms
model: claude-3
tool: specialist-tool
tool-build: 1.0.0
    `;
    fs.writeFileSync(tempTextLogPath, textLogContent, 'utf8');

    const res = cp.spawnSync(
      'node',
      [
        recordAttemptScript,
        '--id',
        testOneShotId,
        '--session-log',
        tempTextLogPath,
        '--tool',
        'cli-override-tool',
      ],
      { encoding: 'utf8' }
    );

    expect(res.status).toBe(0);

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.attempts.length).toBe(1);

    const attempt = updated.attempts[0];
    expect(attempt.model).toBe('claude-3');
    // Overridden by CLI:
    expect(attempt.environment.tool).toBe('cli-override-tool');
    expect(attempt.environment.toolBuild).toBe('1.0.0');
    expect(attempt.build.tokens).toBe(550);
    expect(attempt.build.durationMs).toBe(2500);
  });

  test('CLI_RECORD_10: Correctly parses generic text session-log keys', () => {
    // Reset manifest attempts
    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: { mode: 'human' },
      },
      attempts: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    // Write temp generic text log
    const textLogContent = `
tokens used: 154000
elapsed time: 1040ms
    `;
    fs.writeFileSync(tempGenericTextLogPath, textLogContent, 'utf8');

    const res = cp.spawnSync(
      'node',
      [recordAttemptScript, '--id', testOneShotId, '--session-log', tempGenericTextLogPath],
      { encoding: 'utf8' }
    );

    expect(res.status).toBe(0);

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.attempts.length).toBe(1);

    const attempt = updated.attempts[0];
    expect(attempt.build.tokens).toBe(154000);
    expect(attempt.build.durationMs).toBe(1040);
  });

  // Test 5: E2E remediations tests
  test('CLI_RECORD_11: Fails when session-log contains negative values', () => {
    const tempInvalidLogPath = path.join(__dirname, 'temp_invalid_log.json');
    const invalidLogContent = {
      build: {
        promptTokens: -50,
        completionTokens: 10,
        durationMs: 1000,
      },
    };
    fs.writeFileSync(tempInvalidLogPath, JSON.stringify(invalidLogContent, null, 2), 'utf8');

    try {
      const res = cp.spawnSync(
        'node',
        [recordAttemptScript, '--id', testOneShotId, '--session-log', tempInvalidLogPath],
        { encoding: 'utf8' }
      );

      expect(res.status).toBe(1);
      expect(
        res.stderr.includes('Must be a non-negative, finite integer') ||
          res.stderr.includes('validation error')
      ).toBe(true);
    } finally {
      if (fs.existsSync(tempInvalidLogPath)) {
        try {
          fs.unlinkSync(tempInvalidLogPath);
        } catch (e) {
          // ignore
        }
      }
    }
  });

  test('CLI_RECORD_12: Fails when session-log path points outside the workspace', () => {
    const outsideLogPath = path.join(repoRoot, '..', 'outside_log.json');
    const res = cp.spawnSync(
      'node',
      [recordAttemptScript, '--id', testOneShotId, '--session-log', outsideLogPath],
      { encoding: 'utf8' }
    );

    expect(res.status).toBe(1);
    expect(res.stderr.includes('outside the workspace')).toBe(true);
  });

  test('CLI_RECORD_13: Fails on non-kebab-case one-shot IDs', () => {
    const invalidIds = ['Test-Record', 'test_record', 'test.record', 'test record', 'test/record'];
    for (const invalidId of invalidIds) {
      const res = cp.spawnSync('node', [recordAttemptScript, '--id', invalidId], {
        encoding: 'utf8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr.includes('kebab-case')).toBe(true);
    }
  });

  test('CLI_RECORD_14: Handles concurrency and loses no updates when run in parallel', async () => {
    // Reset manifest attempts
    const mockManifest = {
      schemaVersion: 1,
      spec: {
        vision: 'A mock vision for E2E testing of record-attempt.',
        createdAt: '2026-06-18T00:00:00Z',
        acceptance: { mode: 'human' },
      },
      attempts: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(mockManifest, null, 2), 'utf8');

    const numInstances = 5;
    const promises = [];

    for (let i = 0; i < numInstances; i++) {
      promises.push(
        new Promise((resolve) => {
          const child = cp.spawn('node', [
            recordAttemptScript,
            '--id',
            testOneShotId,
            '--model',
            `concurrent-model-${i}`,
            '--build-tokens',
            String(100 + i),
          ]);

          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          child.on('close', (code) => {
            resolve({ code, stdout, stderr });
          });
        })
      );
    }

    const results = await Promise.all(promises);

    results.forEach((r, idx) => {
      if (r.code !== 0) {
        console.error(`Process ${idx} exited with code ${r.code}. stderr: ${r.stderr}`);
      }
    });

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.attempts.length).toBe(numInstances);

    const tokens = updated.attempts.map((a) => a.build.tokens).sort();
    expect(tokens).toEqual([100, 101, 102, 103, 104]);
  });
});
