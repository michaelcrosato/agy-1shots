import fs from 'fs';
import path from 'path';

let cachedPricing = null;
let cachedPricingDate = '2026-06-17'; // fallback default
let cachedAliasMap = null;

// Canonicalize a model identifier for matching. Attempt manifests store API-form
// ids ("claude-opus-4-8"), the pricing CSV stores display names ("Claude Opus
// 4.8"), and some attempts carry an effort qualifier ("Gemini 3.5 Flash (high)").
// Lowercasing, dropping parenthetical qualifiers, and collapsing every separator
// (hyphen, dot, slash, space) to a single space makes all three forms converge,
// so "claude-opus-4-8" and "Claude Opus 4.8" both become "claude opus 4 8".
function normalizeModelId(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "(high)", "(legacy)", "(preview)" -> drop
    .replace(/[^a-z0-9]+/g, ' ') // hyphen/dot/slash/space -> single space
    .trim();
}

// Build a normalized-id -> pricing-row map once. A CSV name like
// "Claude Opus 4.1 / Opus 4 (legacy)" yields two aliases ("claude opus 4 1" and
// "opus 4"), so the API id "claude-opus-4-1" still resolves. First row wins on a
// collision, preserving the prior find()-order semantics.
function getAliasMap() {
  if (cachedAliasMap) return cachedAliasMap;
  const map = new Map();
  for (const p of loadPricingData()) {
    const aliases = String(p.Model || '')
      .split('/')
      .map(normalizeModelId)
      .filter(Boolean);
    for (const alias of aliases) {
      if (!map.has(alias)) map.set(alias, p);
    }
  }
  cachedAliasMap = map;
  return map;
}

function loadPricingData() {
  if (cachedPricing) return cachedPricing;

  // Using process.cwd() as it resolves to the dashboard folder when running under Next.js
  const csvPath = path.resolve(process.cwd(), 'lib/model_pricing.csv');
  try {
    const text = fs.readFileSync(csvPath, 'utf8');

    // Parse last updated date from comments
    const dateMatch = /#\s*Last\s*Updated:\s*([^\r\n]+)/i.exec(text);
    if (dateMatch) {
      cachedPricingDate = dateMatch[1].trim();
    }

    const lines = text.split(/\r?\n/);
    const result = [];
    let headers = null;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      const fields = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());

      const cleanedFields = fields.map((f) => {
        if (f.startsWith('"') && f.endsWith('"')) {
          return f.slice(1, -1).trim();
        }
        return f;
      });

      if (!headers) {
        headers = cleanedFields;
        continue;
      }

      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cleanedFields[idx] || '';
      });
      result.push(obj);
    }

    cachedPricing = result;
    return result;
  } catch (err) {
    console.error('Error loading model pricing CSV:', err.message);
    return [];
  }
}

export function getPricingDate() {
  loadPricingData();
  return cachedPricingDate;
}

export function getPricingForModel(modelName) {
  if (!modelName || typeof modelName !== 'string') return null;
  const normalized = normalizeModelId(modelName);
  if (!normalized) return null;

  // Exact match on the normalized id. This deliberately does NOT fall back to
  // substring or first-word-prefix guessing: those mapped any unknown id whose
  // first word matched a row (e.g. "claude-whatever" -> the first "Claude …"
  // row), which silently mis-prices. An id we don't recognize returns null.
  return getAliasMap().get(normalized) || null;
}

export function calculateCost(modelName, tokens) {
  if (tokens === null || tokens === undefined || tokens === '') return null;
  const t = Number(tokens);
  if (!Number.isFinite(t) || t <= 0) return 0;

  const entry = getPricingForModel(modelName);
  if (!entry) return null; // Model unknown

  const inputPrice = Number(entry.InputPricePer1M);
  const outputPrice = Number(entry.OutputPricePer1M);

  if (isNaN(inputPrice) || isNaN(outputPrice)) return null;

  // 80% input / 20% output blend
  const blendedRate = inputPrice * 0.8 + outputPrice * 0.2;
  const cost = (t * blendedRate) / 1000000;
  return Number(cost.toFixed(4));
}
