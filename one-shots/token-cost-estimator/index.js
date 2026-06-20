#!/usr/bin/env node
'use strict';

/**
 * token-cost-estimator
 *
 * A tiny, dependency-free, deterministic utility that estimates the token count
 * of a piece of text and the blended USD cost of processing it with a given
 * model. Self-contained (its own pricing table) per OneShotForge isolation.
 *
 * This is an *example* one-shot: it is small enough for any model to produce in
 * one shot, yet it has an objective, program-verifiable contract — so it doubles
 * as an accurate benchmark target. Run `node verify.js` for the acceptance test.
 */

// USD per 1,000,000 tokens. A compact snapshot purely for the estimate; the
// estimator is deterministic regardless of how stale the table is.
const PRICING_PER_1M = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gemini-3-pro': { input: 1.25, output: 10 },
};

/**
 * Estimate token count from text using the common ~4-characters-per-token
 * heuristic. Deterministic and total: any non-string is treated as empty.
 * @param {string} text
 * @returns {number} non-negative integer token estimate
 */
function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate blended USD cost for processing `tokens` with `model`, using an
 * 80% input / 20% output blend (the same blend OneShotForge uses elsewhere).
 * Returns null for an unknown model — never a guess.
 * @param {string} model
 * @param {number} tokens
 * @param {{inputRatio?: number}} [opts]
 * @returns {number|null} cost in USD rounded to 6 decimals, or null
 */
function estimateCostUsd(model, tokens, opts = {}) {
  const price = PRICING_PER_1M[model];
  if (!price) return null;
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return 0;
  const inputRatio = typeof opts.inputRatio === 'number' ? opts.inputRatio : 0.8;
  const outputRatio = 1 - inputRatio;
  const blendedPerToken = (price.input * inputRatio + price.output * outputRatio) / 1_000_000;
  return Number((tokens * blendedPerToken).toFixed(6));
}

/** List the models this estimator knows about. */
function knownModels() {
  return Object.keys(PRICING_PER_1M);
}

function main(argv) {
  const args = argv.slice(2);
  const model = args[0] || 'gpt-4o-mini';
  const text = args.slice(1).join(' ') || 'Hello, world!';
  const tokens = estimateTokens(text);
  const cost = estimateCostUsd(model, tokens);
  const result = {
    model,
    chars: text.length,
    estimatedTokens: tokens,
    estimatedCostUsd: cost,
    known: cost !== null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (cost === null) {
    console.error(`Unknown model "${model}". Known: ${knownModels().join(', ')}`);
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { estimateTokens, estimateCostUsd, knownModels, PRICING_PER_1M };
