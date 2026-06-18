const fs = require('fs');
const path = require('path');

describe('F1: Monorepo Structure', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  test('F1_1: Root contains one-shots directory', () => {
    const dir = path.join(rootDir, 'one-shots');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  test('F1_2: Root contains dashboard directory', () => {
    const dir = path.join(rootDir, 'dashboard');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  test('F1_3: Root contains tests/e2e directory', () => {
    const dir = path.join(rootDir, 'tests/e2e');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  test('F1_4: Root contains README.md', () => {
    const file = path.join(rootDir, 'README.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).isFile()).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('OneShotForge')).toBe(true);

    // Ensure all JSON blocks in README.md are valid JSON (no comments)
    const jsonBlocks = [...content.matchAll(/```json\s*([\s\S]*?)\s*```/g)].map((m) => m[1].trim());
    expect(jsonBlocks.length).toBeGreaterThan(0);
    jsonBlocks.forEach((block) => {
      let parsed;
      try {
        parsed = JSON.parse(block);
      } catch (err) {
        throw new Error(`Invalid JSON block in README.md: ${block}\nError: ${err.message}`);
      }
      expect(typeof parsed).toBe('object');
    });
  });

  test('F1_5: Root contains AGENTS.md', () => {
    const file = path.join(rootDir, 'AGENTS.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).isFile()).toBe(true);
    const content = fs.readFileSync(file, 'utf8');
    expect(content.includes('Agent Constitution')).toBe(true);
    expect(content.includes('└────────────────────────────┴────────────────────────────┘')).toBe(
      false
    );
    expect(content.includes('└─────────────────────────────────────────────────────────┘')).toBe(
      true
    );
  });

  test('F1_6: All items under one-shots are directories or gitkeep', () => {
    const oneShotsDir = path.join(rootDir, 'one-shots');
    const items = fs.readdirSync(oneShotsDir);
    items.forEach((item) => {
      const fullPath = path.join(oneShotsDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        expect(item).toBe('.gitkeep');
      } else {
        expect(stat.isDirectory()).toBe(true);
      }
    });
  });

  test('F1_7: All one-shot subdirectories match kebab-case naming format', () => {
    const oneShotsDir = path.join(rootDir, 'one-shots');
    const items = fs.readdirSync(oneShotsDir);
    items.forEach((item) => {
      const fullPath = path.join(oneShotsDir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        const isValidKebab = /^[a-z0-9-]+$/.test(item);
        expect(isValidKebab).toBe(true);
      }
    });
  });

  test('F1_8: Each one-shot directory contains a valid package.json file if it is not empty', () => {
    const oneShotsDir = path.join(rootDir, 'one-shots');
    const items = fs.readdirSync(oneShotsDir);
    items.forEach((item) => {
      const fullPath = path.join(oneShotsDir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        const pkgFile = path.join(fullPath, 'package.json');
        expect(fs.existsSync(pkgFile)).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        expect(typeof pkg).toBe('object');
      }
    });
  });

  test('F1_9: Each one-shot package.json name matches its directory name', () => {
    const oneShotsDir = path.join(rootDir, 'one-shots');
    const items = fs.readdirSync(oneShotsDir);
    items.forEach((item) => {
      const fullPath = path.join(oneShotsDir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        const pkg = JSON.parse(fs.readFileSync(path.join(fullPath, 'package.json'), 'utf8'));
        expect(pkg.name).toBe(item);
      }
    });
  });

  test('F1_10: No files under one-shots cross-import sibling one-shots', () => {
    const oneShotsDir = path.join(rootDir, 'one-shots');
    const items = fs.readdirSync(oneShotsDir).filter((item) => {
      return fs.statSync(path.join(oneShotsDir, item)).isDirectory();
    });

    items.forEach((item) => {
      const itemPath = path.join(oneShotsDir, item);

      // Simple scan helper to read files recursively
      function checkImports(dir) {
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            checkImports(filePath);
          } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = fs.readFileSync(filePath, 'utf8');
            // Check for imports or requires pointing to ../ other than the expected shared path
            const requireMatches = content.match(/require\(['"]\.\.\/([^'"]+)['"]\)/g) || [];
            const importMatches = content.match(/from\s+['"]\.\.\/([^'"]+)['"]/g) || [];

            const allMatches = [...requireMatches, ...importMatches];
            allMatches.forEach((match) => {
              // Extract the target directory path from the relative import
              const matchDir = match.includes('from')
                ? match.match(/from\s+['"]\.\.\/([^'"]+)['"]/)[1]
                : match.match(/require\(['"]\.\.\/([^'"]+)['"]\)/)[1];

              // Verify that it doesn't target another item in the items list
              items.forEach((otherItem) => {
                if (otherItem !== item) {
                  const isCrossImport =
                    matchDir.startsWith(otherItem + '/') || matchDir === otherItem;
                  expect(isCrossImport).toBe(false);
                }
              });
            });
          }
        });
      }
      checkImports(itemPath);
    });
  });
});
