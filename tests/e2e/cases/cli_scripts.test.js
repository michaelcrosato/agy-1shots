const fs = require('fs');
const path = require('path');
const cp = require('child_process');

describe('Milestone 3: CLI Scripts', () => {
  const repoRoot = path.resolve(__dirname, '../../../');
  const registryPath = path.join(repoRoot, 'ideas', 'registry.json');
  const readmePath = path.join(repoRoot, 'ideas', 'README.md');
  const ideasMdPath = path.join(repoRoot, 'IDEAS.md');
  const promoteScript = path.join(repoRoot, 'scripts', 'promote.py');
  const promptGenScript = path.join(repoRoot, 'scripts', 'prompt-gen.py');

  let registryBackup = null;
  let readmeBackup = null;
  let ideasMdBackup = null;

  beforeAll(() => {
    // Back up the files on disk
    if (fs.existsSync(registryPath)) {
      registryBackup = fs.readFileSync(registryPath, 'utf8');
      try {
        const registry = JSON.parse(registryBackup);
        const auto003 = registry.find((item) => item.id === 'AUTO-003');
        if (auto003 && auto003.status !== 'backlog') {
          auto003.status = 'backlog';
          auto003.promoted_to = null;
          fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        }
      } catch (err) {
        // Ignore json parse error here
      }
    }
    if (fs.existsSync(readmePath)) {
      readmeBackup = fs.readFileSync(readmePath, 'utf8');
    }
    if (fs.existsSync(ideasMdPath)) {
      ideasMdBackup = fs.readFileSync(ideasMdPath, 'utf8');
    }
  });

  afterAll(() => {
    // Restore the original state
    if (registryBackup !== null) {
      fs.writeFileSync(registryPath, registryBackup, 'utf8');
    }
    if (readmeBackup !== null) {
      fs.writeFileSync(readmePath, readmeBackup, 'utf8');
    }
    if (ideasMdBackup !== null) {
      fs.writeFileSync(ideasMdPath, ideasMdBackup, 'utf8');
    }

    // Clean up scaffolded directories
    const pathsToClean = [
      path.join(repoRoot, 'one-shots', 'adf-lead-parser-crm-webhook-auto-enricher'),
      path.join(repoRoot, 'one-shots', 'test-placeholders-idea'),
    ];
    for (const p of pathsToClean) {
      if (fs.existsSync(p)) {
        let attempts = 0;
        while (attempts < 5) {
          try {
            fs.rmSync(p, { recursive: true, force: true });
            break;
          } catch (err) {
            if (err.code === 'EPERM' || err.code === 'EBUSY') {
              attempts++;
              if (attempts >= 5) throw err;
              try {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
              } catch (e) {
                const start = Date.now();
                while (Date.now() - start < 100) {
                  /* busy-wait */
                }
              }
            } else {
              throw err;
            }
          }
        }
      }
    }
  });

  // Test 1: promote.py exits non-zero on missing ID
  test('CLI_1: promote.py fails on non-existent ID', () => {
    const res = cp.spawnSync('python', [promoteScript, 'INVALID-ID'], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('not found')).toBe(true);
  });

  // A title with no ASCII alphanumerics slugifies to '' which would resolve to
  // the shared one-shots/ root and clobber files. Verified fully isolated in a
  // temp repo so it never touches the real registry or one-shots/.
  test('CLI_EMPTYSLUG: promote.py refuses an empty-slug title (no root clobber)', () => {
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-empty-slug-'));
    try {
      fs.mkdirSync(path.join(tmp, 'scripts'));
      fs.mkdirSync(path.join(tmp, 'ideas'));
      fs.mkdirSync(path.join(tmp, 'one-shots'));
      fs.copyFileSync(promoteScript, path.join(tmp, 'scripts', 'promote.py'));
      const idea = {
        id: 'BAD-1',
        title: '!!! ??? ###',
        category: 'Test',
        vision: 'v',
        techSpecs: 't',
        targetStack: 'Node.js',
        readyToCopyTaskPrompt: 'p',
        dateAdded: '2026-01-01',
        status: 'backlog',
        promoted_to: null,
        supersedes: null,
      };
      fs.writeFileSync(path.join(tmp, 'ideas', 'registry.json'), JSON.stringify([idea], null, 2));
      fs.writeFileSync(path.join(tmp, 'ideas', 'README.md'), '');
      fs.writeFileSync(path.join(tmp, 'IDEAS.md'), '');

      const res = cp.spawnSync('python', [path.join(tmp, 'scripts', 'promote.py'), 'BAD-1'], {
        encoding: 'utf8',
      });
      expect(res.status).toBe(1);
      expect(/slug/i.test(res.stderr || '')).toBe(true);
      // The shared one-shots/ root must be untouched.
      expect(fs.existsSync(path.join(tmp, 'one-shots', 'oneshot.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmp, 'one-shots', 'package.json'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  // Test 2: promote.py successfully promotes backlog idea
  test('CLI_2: promote.py successfully scaffolds valid ID', () => {
    // In registry.json, AUTO-003 is "ADF Lead Parser & CRM Webhook Auto-Enricher"
    const res = cp.spawnSync('python', [promoteScript, 'AUTO-003'], { encoding: 'utf8' });
    expect(res.status).toBe(0);

    const slugDir = path.join(repoRoot, 'one-shots', 'adf-lead-parser-crm-webhook-auto-enricher');
    expect(fs.existsSync(slugDir)).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'oneshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'main.py'))).toBe(true); // targetStack contains FastAPI (Python)
    expect(fs.existsSync(path.join(slugDir, 'verify.py'))).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'README.md'))).toBe(true);

    // Verify oneshot.json spec vision
    const oneshotJson = JSON.parse(fs.readFileSync(path.join(slugDir, 'oneshot.json'), 'utf8'));
    expect(oneshotJson.schemaVersion).toBe(1);
    expect(oneshotJson.spec.vision.includes('Accepts raw payloads')).toBe(true);
    expect(oneshotJson.attempts[0].id).toBe('att_seed');
    expect(oneshotJson.attempts[0].model).toBe('Gemini 3.5 Flash');

    // Verify package.json scripts and tags
    const pkgJson = JSON.parse(fs.readFileSync(path.join(slugDir, 'package.json'), 'utf8'));
    expect(pkgJson.name).toBe('adf-lead-parser-crm-webhook-auto-enricher');
    expect(pkgJson.scripts.start).toBe('python main.py');
    expect(pkgJson.scripts.test).toBe('python verify.py');
    expect(pkgJson.scripts.verify).toBe('python verify.py');
    expect(pkgJson.tags.includes('fastapi (python)')).toBe(true);

    // Verify registry update
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const updatedIdea = registry.find((item) => item.id === 'AUTO-003');
    expect(updatedIdea.status).toBe('promoted');
    expect(updatedIdea.promoted_to).toBe('adf-lead-parser-crm-webhook-auto-enricher');

    // Verify doc regeneration
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme.includes('adf-lead-parser-crm-webhook-auto-enricher')).toBe(true);

    const ideasMd = fs.readFileSync(ideasMdPath, 'utf8');
    expect(ideasMd.includes('one-shots/adf-lead-parser-crm-webhook-auto-enricher/')).toBe(true);
  });

  // Test 3: promote.py is idempotent / exits 0 if already promoted
  test('CLI_3: promote.py exits 0 on already promoted ID', () => {
    const res = cp.spawnSync('python', [promoteScript, 'AUTO-003'], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout.includes('already promoted')).toBe(true);
  });

  // Test 4: prompt-gen.py prints error on missing ID
  test('CLI_4: prompt-gen.py fails when no args provided', () => {
    const res = cp.spawnSync('python', [promptGenScript], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('ID is required')).toBe(true);
  });

  // Test 5: prompt-gen.py prints error on invalid ID
  test('CLI_5: prompt-gen.py fails on invalid ID', () => {
    const res = cp.spawnSync('python', [promptGenScript, 'INVALID-ID'], { encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr.includes('not found')).toBe(true);
  });

  // Test 6: prompt-gen.py substitutes placeholders with default values and overrides
  test('CLI_6: prompt-gen.py performs variable substitution', () => {
    // Inject a test idea into registry
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const testIdea = {
      id: 'TEST-999',
      title: 'Test Placeholders Idea',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'Test vision',
      techSpecs: 'Test specs',
      targetStack: 'Python',
      readyToCopyTaskPrompt: 'Build it in {{LANGUAGE}} with {{FRAMEWORK}} and {{DATABASE}}.',
      dateAdded: '2026-06-17',
      status: 'backlog',
      promoted_to: null,
      supersedes: null,
    };
    registry.push(testIdea);
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');

    // Test default substitution (no overrides)
    const resDefault = cp.spawnSync('python', [promptGenScript, 'TEST-999'], { encoding: 'utf8' });
    expect(resDefault.status).toBe(0);
    expect(resDefault.stdout.trim()).toBe('Build it in Python with Playwright and SQLite.');

    // Test with overrides
    const resOverride = cp.spawnSync(
      'python',
      [
        promptGenScript,
        'TEST-999',
        '--language',
        'TypeScript',
        '--framework',
        'Express',
        '--database',
        'PostgreSQL',
      ],
      { encoding: 'utf8' }
    );
    expect(resOverride.status).toBe(0);
    expect(resOverride.stdout.trim()).toBe('Build it in TypeScript with Express and PostgreSQL.');

    // Test case-insensitivity of overrides
    const resCaseOverride = cp.spawnSync(
      'python',
      [promptGenScript, 'TEST-999', '--LaNgUaGe', 'Rust'],
      { encoding: 'utf8' }
    );
    expect(resCaseOverride.status).toBe(0);
    expect(resCaseOverride.stdout.trim()).toBe('Build it in Rust with Playwright and SQLite.');
  });
});
