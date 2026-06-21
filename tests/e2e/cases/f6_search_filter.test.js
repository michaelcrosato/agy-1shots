const fs = require('fs');
const path = require('path');

describe('F6: Dashboard Search/Filter', () => {
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
            break; // Already deleted
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

  beforeAll(() => {
    // Create temporary pieces to search and filter
    const pieces = [
      {
        id: 'temp-filter-notion',
        pkg: {
          name: 'temp-filter-notion',
          version: '1.0.0',
          description: 'Notion Scraper for tests',
          tags: ['scraper', 'notion', 'test-tag'],
        },
      },
      {
        id: 'temp-filter-slack',
        pkg: {
          name: 'temp-filter-slack',
          version: '1.0.0',
          description: 'Slack Bot notifier',
          tags: ['notifier', 'slack', 'test-tag'],
        },
      },
    ];

    pieces.forEach((p) => {
      const pPath = path.join(oneShotsDir, p.id);
      rmDirRecursive(pPath);
      fs.mkdirSync(pPath, { recursive: true });
      tempDirs.push(pPath);
      fs.writeFileSync(path.join(pPath, 'package.json'), JSON.stringify(p.pkg, null, 2), 'utf8');
    });
  });

  afterAll(() => {
    while (tempDirs.length > 0) {
      const p = tempDirs.pop();
      if (fs.existsSync(p)) {
        rmDirRecursive(p);
      }
    }
  });

  test('F6_1: GET /api/scan?search=notion returns matching item', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=notion`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    const hasSlack = data.some((item) => item.id === 'temp-filter-slack');
    expect(hasNotion).toBe(true);
    expect(hasSlack).toBe(false);
  });

  test('F6_2: GET /api/scan?search=NOTION is case-insensitive', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=NOTION`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    expect(hasNotion).toBe(true);
  });

  test('F6_3: GET /api/scan?search=  notion   trims whitespace', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=%20%20notion%20%20%20`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    expect(hasNotion).toBe(true);
  });

  test('F6_4: GET /api/scan?search=nonexistent returns empty/filtered array', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=nonexistent`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    const hasSlack = data.some((item) => item.id === 'temp-filter-slack');
    expect(hasNotion).toBe(false);
    expect(hasSlack).toBe(false);
  });

  test('F6_5: GET /api/scan?tag=scraper returns scraper-tagged items', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?tag=scraper`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    const hasSlack = data.some((item) => item.id === 'temp-filter-slack');
    expect(hasNotion).toBe(true);
    expect(hasSlack).toBe(false);
  });

  test('F6_6: GET /api/scan?tag=test-tag returns both items', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?tag=test-tag`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    const hasSlack = data.some((item) => item.id === 'temp-filter-slack');
    expect(hasNotion).toBe(true);
    expect(hasSlack).toBe(true);
  });

  test('F6_7: GET /api/scan?tag=nonexistent returns no matching items', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?tag=nonexistent`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    expect(hasNotion).toBe(false);
  });

  test('F6_8: GET /api/scan with search and tag combined (intersection)', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=slack&tag=test-tag`);
    const data = await res.json();
    const hasNotion = data.some((item) => item.id === 'temp-filter-notion');
    const hasSlack = data.some((item) => item.id === 'temp-filter-slack');
    expect(hasNotion).toBe(false);
    expect(hasSlack).toBe(true);
  });

  test('F6_9: GET /api/scan search handles regex special characters safely', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan?search=[a-z]*`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('F6_10: GET /api/scan returns sorted results by name alphabetically', async () => {
    const res = await fetch(`${DASHBOARD_URL}/api/scan`);
    const data = await res.json();

    // Extract names of our temp components in the order returned
    const names = data.map((item) => item.name).filter((name) => name.startsWith('temp-filter-'));
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });
});
