const fs = require('fs');
const path = require('path');

const DASHBOARD_URL = 'http://localhost:3000';
const oneShotsDir = path.resolve(__dirname, '../one-shots');

function rmDirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rmDirRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

async function runEmpiricalTests() {
  console.log('=== Challenger Empirical Verification Tests ===\n');

  // ----------------------------------------------------
  // Part 1: Verify /api/suggest dynamic behavior
  // ----------------------------------------------------
  console.log('--- Part 1: Testing /api/suggest Dynamic Routing ---');
  const suggestTempDir = path.join(oneShotsDir, 'temp-suggest-verify');

  const cleanSuggestTemp = () => {
    rmDirRecursive(suggestTempDir);
  };

  try {
    // A. Directory does not exist (404)
    console.log('Testing suggest with non-existent directory...');
    const res404 = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'non-existent-directory-xyz' }),
    });
    console.log(`  Non-existent: Status = ${res404.status}`);
    if (res404.status !== 404) throw new Error('Expected 404 for non-existent directory');

    // Create temp directory
    fs.mkdirSync(suggestTempDir, { recursive: true });

    // B. Missing package.json and index.js
    console.log('Testing suggest with missing package.json and index.js...');
    const resEmpty = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    if (resEmpty.status !== 200) throw new Error(`Expected 200, got ${resEmpty.status}`);
    const dataEmpty = await resEmpty.json();
    console.log(
      '  Empty directory suggestions:',
      dataEmpty.suggestions.map((s) => s.type)
    );

    const hasConfigSuggestion = dataEmpty.suggestions.some(
      (s) => s.type === 'configuration' && s.description.includes('Missing package.json')
    );
    const hasImplSuggestion = dataEmpty.suggestions.some(
      (s) => s.type === 'implementation' && s.description.includes('Missing main execution script')
    );
    if (!hasConfigSuggestion || !hasImplSuggestion) {
      throw new Error('Missing package.json or index.js suggestion was not returned dynamically');
    }
    console.log('  [PASS] Correctly detected missing package.json and index.js dynamically');

    // C. Malformed package.json
    console.log('Testing suggest with malformed package.json...');
    fs.writeFileSync(
      path.join(suggestTempDir, 'package.json'),
      '{ "name": "temp-suggest-verify", ',
      'utf8'
    );
    const resMalformed = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    const dataMalformed = await resMalformed.json();
    console.log(
      '  Malformed suggestions:',
      dataMalformed.suggestions.map((s) => s.type)
    );
    const hasMalformedSuggestion = dataMalformed.suggestions.some(
      (s) => s.type === 'configuration' && s.description.includes('malformed or invalid JSON')
    );
    if (!hasMalformedSuggestion)
      throw new Error('Malformed package.json suggestion was not returned dynamically');
    console.log('  [PASS] Correctly detected malformed package.json');

    // D. Missing start/test scripts
    console.log('Testing suggest with missing start/test scripts...');
    fs.writeFileSync(
      path.join(suggestTempDir, 'package.json'),
      JSON.stringify({
        name: 'temp-suggest-verify',
        version: '1.0.0',
        description: 'Test suggest verify',
        tags: ['test'],
        scripts: {}, // Empty scripts
      }),
      'utf8'
    );
    const resMissingScripts = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    const dataMissingScripts = await resMissingScripts.json();
    console.log(
      '  Missing scripts suggestions:',
      dataMissingScripts.suggestions.map((s) => s.type)
    );
    const hasStartScriptSuggestion = dataMissingScripts.suggestions.some((s) =>
      s.description.includes('start')
    );
    const hasTestScriptSuggestion = dataMissingScripts.suggestions.some((s) =>
      s.description.includes('test')
    );
    if (!hasStartScriptSuggestion || !hasTestScriptSuggestion)
      throw new Error('Missing script suggestions not returned dynamically');
    console.log('  [PASS] Correctly detected missing start and test scripts');

    // E. Notion scraper missing client SDK
    console.log('Testing suggest with Notion scraper name but missing SDK dependency...');
    fs.writeFileSync(
      path.join(suggestTempDir, 'package.json'),
      JSON.stringify({
        name: 'temp-notion-scraper-verify',
        version: '1.0.0',
        description: 'Test notion suggest verify',
        tags: ['test'],
        scripts: { start: 'node index.js', test: 'node index.js --test' },
        dependencies: {},
      }),
      'utf8'
    );
    const resNotionSdk = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    const dataNotionSdk = await resNotionSdk.json();
    console.log(
      '  Notion SDK suggestions:',
      dataNotionSdk.suggestions.map((s) => s.type)
    );
    const hasNotionSdkSuggestion = dataNotionSdk.suggestions.some(
      (s) => s.type === 'dependency' && s.description.includes('@notionhq/client')
    );
    if (!hasNotionSdkSuggestion)
      throw new Error('Missing notion client dependency suggestion not returned dynamically');
    console.log('  [PASS] Correctly detected missing Notion SDK dependency');

    // F. Mock implementation in index.js
    console.log('Testing suggest with mock code in index.js...');
    fs.writeFileSync(
      path.join(suggestTempDir, 'index.js'),
      'console.log("Mock notion-scraper execution successful");',
      'utf8'
    );
    const resMockCode = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    const dataMockCode = await resMockCode.json();
    console.log(
      '  Mock code suggestions:',
      dataMockCode.suggestions.map((s) => s.type)
    );
    const hasMockSuggestion = dataMockCode.suggestions.some(
      (s) => s.type === 'implementation' && s.description.includes('Dummy mock code detected')
    );
    if (!hasMockSuggestion)
      throw new Error('Mock code detection suggestion not returned dynamically');
    console.log('  [PASS] Correctly detected mock code in index.js');

    // G. Exception handling block missing in index.js
    console.log('Testing suggest with missing try-catch block in long index.js...');
    fs.writeFileSync(
      path.join(suggestTempDir, 'index.js'),
      `
      const a = 1;
      const b = 2;
      const c = a + b;
      console.log("Adding numbers", c);
      // Make it long enough to trigger the warning (> 200 chars)
      function doSomeMath(x, y) {
        console.log("Performing math operations");
        console.log("Multiplying", x * y);
        console.log("Dividing", x / y);
        return x + y;
      }
      doSomeMath(5, 10);
    `,
      'utf8'
    );
    const resTryCatch = await fetch(`${DASHBOARD_URL}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'temp-suggest-verify' }),
    });
    const dataTryCatch = await resTryCatch.json();
    console.log(
      '  Try-catch suggestions:',
      dataTryCatch.suggestions.map((s) => s.type)
    );
    const hasTryCatchSuggestion = dataTryCatch.suggestions.some(
      (s) => s.type === 'robustness' && s.description.includes('try-catch')
    );
    if (!hasTryCatchSuggestion)
      throw new Error('Missing try-catch suggestion not returned dynamically');
    console.log('  [PASS] Correctly detected missing try-catch in index.js');
  } finally {
    cleanSuggestTemp();
  }

  // ----------------------------------------------------
  // Part 2: Verify stats.json concurrency and lock behaviors
  // ----------------------------------------------------
  console.log('\n--- Part 2: Testing stats.json Concurrency and Locks ---');

  // A. Read initial stats
  const initialStatsRes = await fetch(`${DASHBOARD_URL}/api/stats`);
  if (initialStatsRes.status !== 200) throw new Error('Failed to get initial stats');
  const initialStats = await initialStatsRes.json();
  console.log('  Initial Stats:', initialStats);

  // B. Trigger 30 concurrent runs of notion-scraper in mock test mode
  console.log('  Sending 30 concurrent execution requests to /api/run...');
  const promises = [];
  for (let i = 0; i < 30; i++) {
    promises.push(
      fetch(`${DASHBOARD_URL}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'notion-scraper',
          action: 'test',
        }),
      }).then(async (res) => {
        if (res.status !== 200) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json();
        if (data.success !== true) {
          throw new Error(`Execution failed: ${data.stderr || data.error}`);
        }
        return data;
      })
    );
  }

  await Promise.all(promises);
  console.log(`  All 30 concurrent runs finished successfully. checking stats...`);

  // C. Verify final stats
  const finalStatsRes = await fetch(`${DASHBOARD_URL}/api/stats`);
  if (finalStatsRes.status !== 200) throw new Error('Failed to get final stats');
  const finalStats = await finalStatsRes.json();
  console.log('  Final Stats:', finalStats);

  const expectedTotalRuns = initialStats.totalRuns + 30;
  if (finalStats.totalRuns !== expectedTotalRuns) {
    throw new Error(
      `Stats discrepancy: expected totalRuns to be ${expectedTotalRuns}, but got ${finalStats.totalRuns}`
    );
  }
  console.log(
    `  [PASS] stats.json totalRuns incremented exactly by 30 (from ${initialStats.totalRuns} to ${finalStats.totalRuns})`
  );

  console.log('\n=== ALL CHALLENGER EMPIRICAL VERIFICATION TESTS PASSED SUCCESSFULLY ===');
}

runEmpiricalTests().catch((err) => {
  console.error('\n✗ TEST RUNNER CRASHED WITH ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
