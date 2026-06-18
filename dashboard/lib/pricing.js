import fs from 'fs';
import path from 'path';

let cachedPricing = null;
let cachedPricingDate = '2026-06-17'; // fallback default

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
  const pricingData = loadPricingData();
  const normalizedSearch = modelName.trim().toLowerCase();

  // 1. Exact match first
  let match = pricingData.find((p) => p.Model.toLowerCase() === normalizedSearch);
  if (match) return match;

  // 2. Substring match
  match = pricingData.find(
    (p) =>
      normalizedSearch.includes(p.Model.toLowerCase()) ||
      p.Model.toLowerCase().includes(normalizedSearch)
  );
  if (match) return match;

  // 3. Fallback to prefix matching
  const firstWord = normalizedSearch.split(' ')[0];
  if (firstWord && firstWord.length > 2) {
    match = pricingData.find((p) => p.Model.toLowerCase().startsWith(firstWord));
    if (match) return match;
  }

  return null;
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
