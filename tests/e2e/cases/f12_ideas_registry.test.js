const fs = require('fs');
const path = require('path');

describe('F12: Ideas Registry API', () => {
  const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const ideasDir = path.resolve(__dirname, '../../../ideas');
  const registryPath = path.join(ideasDir, 'registry.json');
  const readmePath = path.join(ideasDir, 'README.md');

  let registryBackup = null;
  let readmeBackup = null;

  beforeAll(() => {
    // Back up the files on disk
    if (fs.existsSync(registryPath)) {
      registryBackup = fs.readFileSync(registryPath, 'utf8');
    }
    if (fs.existsSync(readmePath)) {
      readmeBackup = fs.readFileSync(readmePath, 'utf8');
    }
  });

  afterAll(() => {
    // Restore the original state
    if (registryBackup !== null) {
      fs.writeFileSync(registryPath, registryBackup, 'utf8');
    } else if (fs.existsSync(registryPath)) {
      fs.unlinkSync(registryPath);
    }

    if (readmeBackup !== null) {
      fs.writeFileSync(readmePath, readmeBackup, 'utf8');
    } else if (fs.existsSync(readmePath)) {
      fs.unlinkSync(readmePath);
    }
  });

  // Test 1: GET /api/ideas returns 200 OK
  test('F12_1: GET /api/ideas returns 200 OK status', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/ideas`);
    expect(res.status).toBe(200);
  });

  // Test 2: GET /api/ideas returns application/json content-type
  test('F12_2: GET /api/ideas returns application/json content-type', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/ideas`);
    const contentType = res.headers.get('content-type');
    expect(contentType.includes('application/json')).toBe(true);
  });

  // Test 3: GET /api/ideas returns a JSON array
  test('F12_3: GET /api/ideas returns a JSON array', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/ideas`);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // Test 4: GET /api/ideas returns at least 51 items
  test('F12_4: GET /api/ideas returns at least 51 items', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/ideas`);
    const data = await res.json();
    expect(data.length >= 51).toBe(true);
  });

  // Test 5: GET /api/ideas items contain required fields
  test('F12_5: GET /api/ideas items contain all required registry fields', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/ideas`);
    const data = await res.json();
    const required = [
      'id',
      'title',
      'category',
      'vision',
      'techSpecs',
      'targetStack',
      'readyToCopyTaskPrompt',
      'dateAdded',
    ];
    for (const item of data) {
      for (const field of required) {
        expect(item.hasOwnProperty(field)).toBe(true);
        expect(typeof item[field]).toBe('string');
      }
    }
  });

  // Test 6: POST /api/ideas creates a valid idea, appends to registry.json and updates README.md on disk
  test('F12_6: POST /api/ideas creating a valid idea returns 200 and updates files on disk', async () => {
    const newIdea = {
      title: 'Unique Test Idea X',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'A test vision for unique test idea X',
      techSpecs: 'WASM, SQLite, React',
      targetStack: 'React, WASM',
      readyToCopyTaskPrompt: 'Build Unique Test Idea X with WASM, SQLite and React.',
    };

    const res = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIdea),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe('Unique Test Idea X');
    expect(data.id).toBe('MICRO-014');

    // Check files on disk
    const diskRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const createdInDisk = diskRegistry.find((item) => item.id === 'MICRO-014');
    expect(createdInDisk).toExist();
    expect(createdInDisk.title).toBe('Unique Test Idea X');

    const diskReadme = fs.readFileSync(readmePath, 'utf8');
    expect(diskReadme.includes('MICRO-014')).toBe(true);
    expect(diskReadme.includes('Unique Test Idea X')).toBe(true);
  });

  // Test 7: POST /api/ideas returns 400 Bad Request if required fields are missing or empty
  test('F12_7: POST /api/ideas returns 400 Bad Request if fields are missing or empty', async () => {
    const invalidIdea = {
      title: '  ', // Empty title
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'A test vision',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const res = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidIdea),
    });
    expect(res.status).toBe(400);

    const missingField = {
      title: 'Valid Title',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      // vision is missing
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const resMissing = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(missingField),
    });
    expect(resMissing.status).toBe(400);
  });

  // Test 8: POST /api/ideas returns 400 Bad Request if category is not allowed
  test('F12_8: POST /api/ideas returns 400 Bad Request if category is not in allowed list', async () => {
    const invalidCategoryIdea = {
      title: 'Invalid Category Test',
      category: 'Not a Real Category',
      vision: 'A test vision',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const res = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidCategoryIdea),
    });
    expect(res.status).toBe(400);
  });

  // Test 9: POST /api/ideas returns 400 Bad Request for directory traversal or prototype pollution patterns
  test('F12_9: POST /api/ideas returns 400 Bad Request if inputs contain traversal or prototype pollution keywords', async () => {
    const traversalIdea = {
      title: 'Traversal Test ../../../../etc/passwd',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'A test vision',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const resTraversal = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(traversalIdea),
    });
    expect(resTraversal.status).toBe(400);

    const pollutionIdea = {
      title: 'Pollution Test __proto__',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'A test vision',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const resPollution = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pollutionIdea),
    });
    expect(resPollution.status).toBe(400);

    const pollutionInFieldIdea = {
      title: 'constructor Test',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'A test vision',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build it.',
    };

    const resPollutionInField = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pollutionInFieldIdea),
    });
    expect(resPollutionInField.status).toBe(400);
  });

  // Test 10: POST /api/ideas duplicates resolution appends a numeric suffix
  test('F12_10: POST /api/ideas duplicates resolution automatically appends numeric suffix', async () => {
    const duplicateBase = {
      title: 'Duplicate Resolution Idea',
      category: 'Micro-SaaS Templates & Personal Workflow Apps',
      vision: 'First instance',
      techSpecs: 'WASM',
      targetStack: 'React',
      readyToCopyTaskPrompt: 'Build duplicate.',
    };

    // First POST
    const res1 = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateBase),
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.id).toBe('MICRO-015');

    // Second POST
    const res2 = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateBase),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.id).toBe('MICRO-016');

    // Third POST
    const res3 = await fetch(`${DASHBOARD_URL}/api/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicateBase),
    });
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3.id).toBe('MICRO-017');
  });

  // Test 11: POST /api/ideas/promote promotes an idea and scaffolds its one-shot
  test('F12_11: POST /api/ideas/promote promotes a backlog idea and scaffolds files', async () => {
    const promoteRes = await fetch(`${DASHBOARD_URL}/api/ideas/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'MICRO-014' }),
    });
    expect(promoteRes.status).toBe(200);
    const promoteData = await promoteRes.json();
    expect(promoteData.success).toBe(true);
    expect(promoteData.slug).toBe('unique-test-idea-x');

    // Verify files were scaffolded
    const slugDir = path.resolve(__dirname, '../../../one-shots/unique-test-idea-x');
    expect(fs.existsSync(slugDir)).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'oneshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(slugDir, 'README.md'))).toBe(true);

    // Clean up scaffolded folder
    fs.rmSync(slugDir, { recursive: true, force: true });
  });
});
