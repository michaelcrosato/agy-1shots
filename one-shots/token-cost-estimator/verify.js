#!/usr/bin/env node
'use strict';

// Acceptance test for token-cost-estimator. Exits 0 on pass, 1 on failure with
// human-readable reasons. This is the objective contract a model's attempt is
// scored against (acceptance.mode = "program").

const { estimateTokens, estimateCostUsd, knownModels } = require('./index.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// --- estimateTokens: deterministic 4-chars-per-token ---
check('empty string => 0 tokens', estimateTokens('') === 0);
check('non-string => 0 tokens', estimateTokens(null) === 0 && estimateTokens(undefined) === 0);
check('400 chars => 100 tokens', estimateTokens('a'.repeat(400)) === 100, `got ${estimateTokens('a'.repeat(400))}`);
check('3 chars => ceil = 1 token', estimateTokens('abc') === 1, `got ${estimateTokens('abc')}`);

// --- estimateCostUsd: known model, 80/20 blend ---
// gpt-4o-mini: input 0.15, output 0.6 per 1M. blended = 0.15*0.8 + 0.6*0.2 = 0.24 per 1M.
// 1,000,000 tokens => $0.24.
const cost1M = estimateCostUsd('gpt-4o-mini', 1_000_000);
check('gpt-4o-mini 1M tokens => $0.24', cost1M === 0.24, `got ${cost1M}`);

// claude-opus-4-8: input 15, output 75. blended = 15*0.8 + 75*0.2 = 27 per 1M. 1M => $27.
const costOpus = estimateCostUsd('claude-opus-4-8', 1_000_000);
check('claude-opus-4-8 1M tokens => $27', costOpus === 27, `got ${costOpus}`);

// --- unknown model returns null, never a guess ---
check('unknown model => null', estimateCostUsd('totally-made-up', 1000) === null);

// --- zero / negative tokens => 0 cost for a known model ---
check('zero tokens => $0', estimateCostUsd('gpt-4o-mini', 0) === 0);
check('negative tokens => $0', estimateCostUsd('gpt-4o-mini', -5) === 0);

// --- knownModels is non-empty and includes the seed models ---
check('knownModels includes gpt-4o-mini', knownModels().includes('gpt-4o-mini'));

if (failures === 0) {
  console.log('\ntoken-cost-estimator: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`\ntoken-cost-estimator: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
