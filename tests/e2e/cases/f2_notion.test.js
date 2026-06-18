const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('F2: Notion Scraper', () => {
  const scraperDir = path.resolve(__dirname, '../../../one-shots/notion-scraper');

  test('F2_1: notion-scraper directory exists under one-shots', () => {
    const exists = fs.existsSync(scraperDir);
    expect(exists).toBe(true);
    if (exists) {
      expect(fs.statSync(scraperDir).isDirectory()).toBe(true);
    }
  });

  test('F2_2: notion-scraper contains package.json', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
  });

  test('F2_3: notion-scraper package.json contains correct name', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe('notion-scraper');
    } else {
      throw new Error('package.json does not exist');
    }
  });

  test('F2_4: notion-scraper contains README.md', () => {
    const readmePath = path.join(scraperDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
  });

  test('F2_5: notion-scraper README.md contains Notion configuration instructions', () => {
    const readmePath = path.join(scraperDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf8');
      expect(content.toLowerCase().includes('notion')).toBe(true);
      expect(
        content.toLowerCase().includes('token') ||
          content.toLowerCase().includes('credential') ||
          content.toLowerCase().includes('env')
      ).toBe(true);
    } else {
      throw new Error('README.md does not exist');
    }
  });

  test('F2_6: notion-scraper has index.js or main entry point', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const mainFile = pkg.main || 'index.js';
      const mainPath = path.join(scraperDir, mainFile);
      expect(fs.existsSync(mainPath)).toBe(true);
    } else {
      throw new Error('package.json does not exist');
    }
  });

  test('F2_7: notion-scraper package.json contains client dependency', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = pkg.dependencies || {};
      const hasNotionClient = Object.keys(deps).some(
        (dep) =>
          dep.includes('notion') ||
          dep.includes('sdk') ||
          dep.includes('client') ||
          dep.includes('axios') ||
          dep.includes('node-fetch')
      );
      expect(hasNotionClient).toBe(true);
    } else {
      throw new Error('package.json does not exist');
    }
  });

  test('F2_8: notion-scraper package.json declares test script', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.scripts && typeof pkg.scripts.test === 'string').toBe(true);
    } else {
      throw new Error('package.json does not exist');
    }
  });

  test('F2_9: notion-scraper package.json declares start script', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.scripts && typeof pkg.scripts.start === 'string').toBe(true);
    } else {
      throw new Error('package.json does not exist');
    }
  });

  test('F2_10: notion-scraper runs mock tests or dry run successfully', () => {
    const pkgPath = path.join(scraperDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      // Execute the test script using mock env variables if needed
      try {
        const output = execSync('npm run test', {
          cwd: scraperDir,
          env: { ...process.env, MOCK: 'true' },
          stdio: 'pipe',
        });
        expect(output.toString()).toExist();
      } catch (err) {
        throw new Error(
          `Scraper dry run failed: ${err.message}\nStdout: ${err.stdout?.toString()}\nStderr: ${err.stderr?.toString()}`
        );
      }
    } else {
      throw new Error('package.json does not exist');
    }
  });
});
