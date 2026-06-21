// Unit tests for model pricing lookup. Run from the dashboard dir:
//   node lib/pricing.test.mjs
//
// Focus: attempt manifests store API-form model ids ("claude-opus-4-8") while
// the pricing CSV uses display names ("Claude Opus 4.8"). The lookup must map
// those, must still cost OpenAI/display-name forms, and must return null for
// genuinely unknown models (never guess).
import assert from 'node:assert';
import { getPricingForModel, calculateCost, calculateCostFromUsage } from './pricing.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

// Opus 4.8 = $5 in / $25 out; 80/20 blend = 5*0.8 + 25*0.2 = $9.00 / 1M tokens.
check('hyphenated claude-opus-4-8 maps to Claude Opus 4.8', () => {
  const p = getPricingForModel('claude-opus-4-8');
  assert.ok(p, 'expected a pricing row');
  assert.strictEqual(p.InputPricePer1M, '5.00');
  assert.strictEqual(p.OutputPricePer1M, '25.00');
  assert.strictEqual(calculateCost('claude-opus-4-8', 1_000_000), 9);
});

check('hyphenated claude-opus-4-6 maps to Claude Opus 4.6', () => {
  assert.strictEqual(calculateCost('claude-opus-4-6', 1_000_000), 9);
});

check('claude-sonnet-4-6 and claude-haiku-4-5 map correctly', () => {
  assert.strictEqual(getPricingForModel('claude-sonnet-4-6').InputPricePer1M, '3.00');
  assert.strictEqual(getPricingForModel('claude-haiku-4-5').InputPricePer1M, '1.00');
});

check('claude-opus-4-1 maps to the legacy row via the "/" alias', () => {
  const p = getPricingForModel('claude-opus-4-1');
  assert.ok(p, 'expected legacy row');
  assert.strictEqual(p.InputPricePer1M, '15.00');
});

check('the repro cost values are now real (not null)', () => {
  // 36,883 tok * $9/1M = $0.331947 -> 0.3319 ; 3,700 tok -> 0.0333
  assert.strictEqual(calculateCost('claude-opus-4-8', 36883), 0.3319);
  assert.strictEqual(calculateCost('claude-opus-4-6', 3700), 0.0333);
});

check('OpenAI gpt-5.4 still costs correctly (no regression)', () => {
  // $2.50 in / $15 out -> blend 2*0.8... = 2 + 3 = $5/1M
  assert.strictEqual(calculateCost('gpt-5.4', 1_000_000), 5);
  assert.strictEqual(calculateCost('gpt-5.4', 1500), 0.0075);
});

check('effort-qualified display name "Gemini 3.5 Flash (high)" maps to base model', () => {
  const p = getPricingForModel('Gemini 3.5 Flash (high)');
  assert.ok(p, 'expected Gemini 3.5 Flash row');
  assert.strictEqual(p.Model, 'Gemini 3.5 Flash');
});

check('display-name input still matches (backward compatible)', () => {
  assert.strictEqual(getPricingForModel('Claude Opus 4.8').Model, 'Claude Opus 4.8');
});

check('genuinely unknown model -> null (never guess)', () => {
  assert.strictEqual(getPricingForModel('totally-made-up-model-9000'), null);
  assert.strictEqual(calculateCost('totally-made-up-model-9000', 1000), null);
});

check('non-model strings -> null', () => {
  assert.strictEqual(getPricingForModel('node'), null);
  assert.strictEqual(getPricingForModel(''), null);
  assert.strictEqual(getPricingForModel(null), null);
});

check('ambiguous bare "claude" -> null (must NOT guess Fable/first row)', () => {
  assert.strictEqual(getPricingForModel('claude'), null);
});

// --- calculateCostFromUsage: exact input/output split pricing ---

check('split pricing uses real input/output rates, not the 80/20 blend', () => {
  // Opus 4.8 = $5 in / $25 out. An output-heavy build: 373,566 in + 2,438,837 out.
  // Exact: (373566*5 + 2438837*25)/1M = 62.8388 -> the blend on the 2,812,403
  // total would give only 2,812,403*9/1M = 25.31, ~2.5x too low.
  const cost = calculateCostFromUsage('claude-opus-4-8', {
    inputTokens: 373566,
    outputTokens: 2438837,
  });
  assert.strictEqual(cost, 62.8388);
});

check('split pricing matches the blend when the split actually is 80/20', () => {
  // 800k in + 200k out at $5/$25 = (800000*5 + 200000*25)/1M = 9.00, same as the
  // 80/20 blend on a 1M total — the blend is just the special case.
  assert.strictEqual(
    calculateCostFromUsage('claude-opus-4-8', { inputTokens: 800000, outputTokens: 200000 }),
    9
  );
});

check('split pricing returns null without a usable split (caller blends)', () => {
  assert.strictEqual(calculateCostFromUsage('claude-opus-4-8', null), null);
  assert.strictEqual(calculateCostFromUsage('claude-opus-4-8', {}), null);
  assert.strictEqual(
    calculateCostFromUsage('claude-opus-4-8', { inputTokens: 0, outputTokens: 0 }),
    null
  );
});

check('split pricing returns null for an unknown model (never guess)', () => {
  assert.strictEqual(
    calculateCostFromUsage('totally-made-up-model-9000', { inputTokens: 100, outputTokens: 100 }),
    null
  );
});

console.log(`\npricing.test.mjs: ALL ${passed} CHECKS PASSED`);
