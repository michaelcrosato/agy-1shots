#!/usr/bin/env node

/**
 * OneShotForge Zero-Dependency BDD Test Runner
 * Path: c:\dev\agy-1shots\tests\e2e\runner.js
 */

const fs = require('fs');
const path = require('path');

// --- Custom Assertion Error ---
class AssertionError extends Error {
  constructor(message, expected, actual) {
    super(message);
    this.name = 'AssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

// --- Deep Equality Helper ---
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (a.constructor !== b.constructor) return false;
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.toString() === b.toString();
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// --- Custom Expect Assertion ---
const expect = (actual) => ({
  toBe(expected) {
    if (actual !== expected) {
      throw new AssertionError(
        `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`,
        expected,
        actual
      );
    }
  },
  toBeNull() {
    if (actual !== null) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be null`, null, actual);
    }
  },
  toEqual(expected) {
    if (!deepEqual(actual, expected)) {
      throw new AssertionError(
        `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
        expected,
        actual
      );
    }
  },
  toContain(expected) {
    if (typeof actual === 'string' || Array.isArray(actual)) {
      if (!actual.includes(expected)) {
        throw new AssertionError(
          `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
          expected,
          actual
        );
      }
    } else {
      throw new AssertionError(
        `Expected ${JSON.stringify(actual)} to be a string or array to check containment of ${JSON.stringify(expected)}`,
        expected,
        actual
      );
    }
  },
  toBeGreaterThan(expected) {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      throw new AssertionError(
        `Expected both arguments to be numbers, got ${typeof actual} and ${typeof expected}`,
        expected,
        actual
      );
    }
    if (actual <= expected) {
      throw new AssertionError(
        `Expected ${actual} to be greater than ${expected}`,
        expected,
        actual
      );
    }
  },
  toExist() {
    if (actual === undefined || actual === null || actual === false) {
      throw new AssertionError(`Expected ${actual} to exist`, 'existent value', actual);
    }
  },
  toNotExist() {
    if (actual !== undefined && actual !== null && actual !== false) {
      throw new AssertionError(`Expected ${actual} to not exist`, 'falsy/null/undefined', actual);
    }
  },
  toThrow(expectedError) {
    if (typeof actual !== 'function') {
      throw new AssertionError(
        `Expected actual value to be a function to check throwing, but got ${typeof actual}`,
        'function',
        actual
      );
    }
    let threw = false;
    let thrownError = null;
    try {
      actual();
    } catch (err) {
      threw = true;
      thrownError = err;
    }
    if (!threw) {
      throw new AssertionError(
        `Expected function to throw an error, but it did not`,
        'error',
        'no error'
      );
    }
    if (expectedError !== undefined) {
      if (typeof expectedError === 'string') {
        if (!thrownError.message.includes(expectedError)) {
          throw new AssertionError(
            `Expected error message to contain "${expectedError}", but got "${thrownError.message}"`,
            expectedError,
            thrownError.message
          );
        }
      } else if (expectedError instanceof RegExp) {
        if (!expectedError.test(thrownError.message)) {
          throw new AssertionError(
            `Expected error message to match ${expectedError}, but got "${thrownError.message}"`,
            expectedError.toString(),
            thrownError.message
          );
        }
      } else if (typeof expectedError === 'function') {
        if (!(thrownError instanceof expectedError)) {
          throw new AssertionError(
            `Expected error to be instance of ${expectedError.name}, but got ${thrownError.name}`,
            expectedError.name,
            thrownError.name
          );
        }
      }
    }
  },
});

// --- Test Suite Registry ---
let currentSuite = null;
const topLevelSuites = [];

function createSuite(name, parent = null) {
  return {
    name,
    parent,
    tests: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
    children: [],
  };
}

global.describe = (name, fn) => {
  const newSuite = createSuite(name, currentSuite);
  if (currentSuite) {
    currentSuite.children.push(newSuite);
  } else {
    topLevelSuites.push(newSuite);
  }

  const temp = currentSuite;
  currentSuite = newSuite;
  try {
    fn();
  } finally {
    currentSuite = temp;
  }
};

global.it = global.test = (name, fn) => {
  if (!currentSuite) {
    global.describe('Default Suite', () => {
      currentSuite.tests.push({ name, fn });
    });
  } else {
    currentSuite.tests.push({ name, fn });
  }
};

global.beforeAll = (fn) => {
  if (currentSuite) currentSuite.beforeAll.push(fn);
};
global.afterAll = (fn) => {
  if (currentSuite) currentSuite.afterAll.push(fn);
};
global.beforeEach = (fn) => {
  if (currentSuite) currentSuite.beforeEach.push(fn);
};
global.afterEach = (fn) => {
  if (currentSuite) currentSuite.afterEach.push(fn);
};
global.expect = expect;

// --- Helper for scanning test files ---
function getTestFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getTestFiles(fullPath));
    } else if (file.endsWith('.test.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

// --- Helper to escape XML ---
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString().replace(/[<>&'"\r\n]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      case '\r':
        return '&#13;';
      case '\n':
        return '&#10;';
      default:
        return c;
    }
  });
}

// --- JUnit Generator ---
function generateJUnitReport(results, totalTime, outputPath) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const totalTests = results.length;
  const totalFailures = results.filter((r) => r.error).length;
  xml += `<testsuites name="OneShotForge E2E Tests" tests="${totalTests}" failures="${totalFailures}" time="${(totalTime / 1000).toFixed(3)}">\n`;

  // Group by classname/suitePath
  const suitesMap = {};
  results.forEach((r) => {
    const key = `${r.fileName} > ${r.suiteName}`;
    if (!suitesMap[key]) {
      suitesMap[key] = [];
    }
    suitesMap[key].push(r);
  });

  for (const [suiteName, suiteResults] of Object.entries(suitesMap)) {
    const failures = suiteResults.filter((r) => r.error).length;
    const time = suiteResults.reduce((acc, r) => acc + (r.duration || 0), 0);
    xml += `  <testsuite name="${escapeXml(suiteName)}" tests="${suiteResults.length}" failures="${failures}" errors="0" time="${(time / 1000).toFixed(3)}">\n`;

    suiteResults.forEach((r) => {
      xml += `    <testcase name="${escapeXml(r.testName)}" classname="${escapeXml(suiteName)}" time="${((r.duration || 0) / 1000).toFixed(3)}">\n`;
      if (r.error) {
        xml += `      <failure message="${escapeXml(r.error.message)}" type="${escapeXml(r.error.name || 'Error')}">\n`;
        xml += escapeXml(r.error.stack || r.error.message);
        xml += '\n      </failure>\n';
      }
      xml += '    </testcase>\n';
    });

    xml += '  </testsuite>\n';
  }

  xml += '</testsuites>\n';

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
  console.log(`\nJUnit XML report written to: ${outputPath}`);
}

// --- Main Execution ---
const allResults = [];
let totalPassed = 0;
let totalFailed = 0;
let startTime = Date.now();
let reportPath = process.env.JUNIT_REPORT_PATH || path.join(__dirname, 'reports', 'junit.xml');

function handleUncaught(err) {
  console.error('\n!!! Gracefully handling unhandled error/rejection !!!');
  console.error(err);

  const errorObj = err instanceof Error ? err : new Error(String(err));
  allResults.push({
    fileName: 'GlobalProcess',
    suiteName: 'ProcessHooks',
    testName: 'Unhandled Exception or Rejection',
    duration: Date.now() - startTime,
    error: errorObj,
  });

  try {
    generateJUnitReport(allResults, Date.now() - startTime, reportPath);
  } catch (writeErr) {
    console.error(`Failed to write JUnit report from process trap: ${writeErr.message}`);
  }

  process.exit(1);
}

process.on('uncaughtException', handleUncaught);
process.on('unhandledRejection', handleUncaught);

async function runSuite(suite, fileName, parentBeforeEach = [], parentAfterEach = []) {
  const suiteBeforeEach = [...parentBeforeEach, ...suite.beforeEach];
  const suiteAfterEach = [...suite.afterEach, ...parentAfterEach];

  let beforeAllFailed = false;
  let beforeAllError = null;

  try {
    for (const hook of suite.beforeAll) {
      await hook();
    }
  } catch (err) {
    console.error(`  ✗ beforeAll hook failed in suite "${suite.name}":`, err.message);
    beforeAllFailed = true;
    beforeAllError = err;
  }

  for (const testCase of suite.tests) {
    const testStart = Date.now();
    let testError = null;

    if (beforeAllFailed) {
      testError = new Error(`Skipped due to beforeAll failure: ${beforeAllError.message}`);
    } else {
      let beforeEachFailed = false;
      try {
        for (const hook of suiteBeforeEach) {
          await hook();
        }
      } catch (err) {
        console.error(`  ✗ beforeEach hook failed for test "${testCase.name}":`, err.message);
        testError = err;
        beforeEachFailed = true;
      }

      if (!beforeEachFailed) {
        try {
          await testCase.fn();
        } catch (err) {
          testError = err;
        }
      }

      try {
        for (const hook of suiteAfterEach) {
          await hook();
        }
      } catch (err) {
        console.error(`  ✗ afterEach hook failed for test "${testCase.name}":`, err.message);
        if (!testError) {
          testError = err;
        }
      }
    }

    const duration = Date.now() - testStart;
    const result = {
      fileName,
      suiteName: suite.name,
      testName: testCase.name,
      duration,
      error: testError,
    };

    allResults.push(result);

    if (testError) {
      totalFailed++;
      console.log(`  ✗ ${testCase.name} (${duration}ms)`);
      console.log(`    Error: ${testError.message}`);
      if (testError.stack) {
        console.log(
          `    Stack:\n${testError.stack
            .split('\n')
            .slice(1, 4)
            .map((l) => '      ' + l.trim())
            .join('\n')}`
        );
      }
    } else {
      totalPassed++;
      console.log(`  ✓ ${testCase.name} (${duration}ms)`);
    }
  }

  for (const childSuite of suite.children) {
    await runSuite(childSuite, fileName, suiteBeforeEach, suiteAfterEach);
  }

  try {
    for (const hook of suite.afterAll) {
      await hook();
    }
  } catch (err) {
    console.error(`  ✗ afterAll hook failed in suite "${suite.name}":`, err.message);
  }
}

async function main() {
  const casesDir = path.join(__dirname, 'cases');

  // Pre-run cleanup of leftover temp directories in one-shots
  try {
    const oneShotsDir = path.resolve(__dirname, '../../one-shots');
    if (fs.existsSync(oneShotsDir)) {
      const items = fs.readdirSync(oneShotsDir);
      for (const item of items) {
        if (item.startsWith('temp-')) {
          const itemPath = path.join(oneShotsDir, item);
          if (fs.statSync(itemPath).isDirectory()) {
            fs.rmSync(itemPath, { recursive: true, force: true });
          }
        }
      }
    }
  } catch (e) {
    console.warn('Warning: Failed to clean up leftover temp folders:', e.message);
  }

  console.log('==================================================');
  console.log('OneShotForge E2E Custom BDD Test Runner');
  console.log('Cases Directory:', casesDir);
  console.log('==================================================\n');

  const testFiles = getTestFiles(casesDir).sort();
  console.log(`Discovered ${testFiles.length} test files:\n`);
  testFiles.forEach((f) => console.log(`  - ${path.relative(casesDir, f)}`));
  console.log('\nStarting test run...\n');

  startTime = Date.now();

  for (const file of testFiles) {
    const relativePath = path.relative(casesDir, file);
    console.log(`\nLoading Suite File: ${relativePath}`);

    // Reset registry globals
    topLevelSuites.length = 0;
    currentSuite = null;

    try {
      require(file);
    } catch (err) {
      console.error(`  ✗ Failed to load test file: ${relativePath}`);
      console.error(err);
      allResults.push({
        fileName: relativePath,
        suiteName: 'Initialization',
        testName: 'Load File',
        duration: 0,
        error: err,
      });
      totalFailed++;
      continue;
    }

    // Run all registered top level suites for this file
    const fileSuites = [...topLevelSuites];
    for (const suite of fileSuites) {
      await runSuite(suite, relativePath);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log('\n==================================================');
  console.log('Test Execution Summary');
  console.log('==================================================');
  console.log(`Total Tests: ${totalPassed + totalFailed}`);
  console.log(`Passed:      ${totalPassed}`);
  console.log(`Failed:      ${totalFailed}`);
  console.log(`Time:        ${(totalTime / 1000).toFixed(2)}s`);
  console.log('==================================================\n');

  reportPath = process.env.JUNIT_REPORT_PATH || path.join(__dirname, 'reports', 'junit.xml');

  try {
    generateJUnitReport(allResults, totalTime, reportPath);
  } catch (err) {
    console.error(`Failed to write JUnit report: ${err.message}`);
  }

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Runner Crashed:', err);
    process.exit(1);
  });
}
