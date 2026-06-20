#!/usr/bin/env node

/**
 * Node.js CLI Script: record-attempt.js
 * Path: scripts/record-attempt.js
 * Usage: node scripts/record-attempt.js --id <one-shot-name> [options]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseArgs } = require('util');

// --- Helper Functions ---

/**
 * Find value of a key in an object case-insensitively.
 * Searches nested structures recursively.
 */
function findKeyCaseInsensitive(obj, targetKey) {
  const targetLower = targetKey.toLowerCase();
  let foundValue = undefined;

  function recurse(current, depth) {
    if (depth > 10) return;
    if (foundValue !== undefined) return;
    if (current && typeof current === 'object') {
      for (const k of Object.keys(current)) {
        if (k.toLowerCase() === targetLower) {
          foundValue = current[k];
          return;
        }
        recurse(current[k], depth + 1);
      }
    }
  }

  recurse(obj, 0);
  return foundValue;
}

/**
 * Safely parse a value as a finite integer or null.
 */
function safeNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Validate that a CLI flag represents a non-negative integer.
 */
function validateNumericArg(val, name) {
  if (val === undefined) return;
  if (!/^\d+$/.test(val)) {
    console.error(`Error: Invalid value for --${name}: "${val}". Must be a non-negative integer.`);
    process.exit(1);
  }
  const parsed = Number(val);
  if (!Number.isFinite(parsed)) {
    console.error(`Error: Invalid value for --${name}: "${val}". Value overflows numeric range.`);
    process.exit(1);
  }
}

/**
 * Parse JSON format log content.
 */
function parseJsonLog(json) {
  let buildTokens = null;
  let buildTime = null;

  // Check case-insensitively for build object
  const buildObj = findKeyCaseInsensitive(json, 'build');

  if (buildObj && typeof buildObj === 'object' && !Array.isArray(buildObj)) {
    const prompt =
      findKeyCaseInsensitive(buildObj, 'promptTokens') ||
      findKeyCaseInsensitive(buildObj, 'prompt_tokens') ||
      findKeyCaseInsensitive(buildObj, 'inputTokens') ||
      findKeyCaseInsensitive(buildObj, 'input_tokens');
    const comp =
      findKeyCaseInsensitive(buildObj, 'completionTokens') ||
      findKeyCaseInsensitive(buildObj, 'completion_tokens') ||
      findKeyCaseInsensitive(buildObj, 'outputTokens') ||
      findKeyCaseInsensitive(buildObj, 'output_tokens');
    const total =
      findKeyCaseInsensitive(buildObj, 'tokens') ||
      findKeyCaseInsensitive(buildObj, 'tokensUsed') ||
      findKeyCaseInsensitive(buildObj, 'tokens_used') ||
      findKeyCaseInsensitive(buildObj, 'totalTokens') ||
      findKeyCaseInsensitive(buildObj, 'total_tokens');
    if (prompt !== undefined || comp !== undefined) {
      buildTokens = (safeNumber(prompt) || 0) + (safeNumber(comp) || 0);
    } else if (total !== undefined) {
      buildTokens = safeNumber(total);
    }

    const dur =
      findKeyCaseInsensitive(buildObj, 'durationMs') ||
      findKeyCaseInsensitive(buildObj, 'duration_ms') ||
      findKeyCaseInsensitive(buildObj, 'duration') ||
      findKeyCaseInsensitive(buildObj, 'time') ||
      findKeyCaseInsensitive(buildObj, 'elapsed') ||
      findKeyCaseInsensitive(buildObj, 'elapsedTime') ||
      findKeyCaseInsensitive(buildObj, 'elapsed_time');
    if (dur !== undefined) {
      buildTime = safeNumber(dur);
    }
  }

  // Check root keys if nested ones not found
  if (buildTokens === null) {
    const bt =
      findKeyCaseInsensitive(json, 'buildTokens') ||
      findKeyCaseInsensitive(json, 'build_tokens') ||
      findKeyCaseInsensitive(json, 'build-tokens');
    if (bt !== undefined) buildTokens = safeNumber(bt);
  }
  if (buildTime === null) {
    const bt =
      findKeyCaseInsensitive(json, 'buildTime') ||
      findKeyCaseInsensitive(json, 'build_time') ||
      findKeyCaseInsensitive(json, 'build-time') ||
      findKeyCaseInsensitive(json, 'buildDuration') ||
      findKeyCaseInsensitive(json, 'build_duration');
    if (bt !== undefined) buildTime = safeNumber(bt);
  }

  // Root-level generic fallback
  const rootPrompt =
    findKeyCaseInsensitive(json, 'promptTokens') ||
    findKeyCaseInsensitive(json, 'prompt_tokens') ||
    findKeyCaseInsensitive(json, 'inputTokens') ||
    findKeyCaseInsensitive(json, 'input_tokens');
  const rootComp =
    findKeyCaseInsensitive(json, 'completionTokens') ||
    findKeyCaseInsensitive(json, 'completion_tokens') ||
    findKeyCaseInsensitive(json, 'outputTokens') ||
    findKeyCaseInsensitive(json, 'output_tokens');
  const rootTotal =
    findKeyCaseInsensitive(json, 'tokens') ||
    findKeyCaseInsensitive(json, 'tokensUsed') ||
    findKeyCaseInsensitive(json, 'tokens_used') ||
    findKeyCaseInsensitive(json, 'totalTokens') ||
    findKeyCaseInsensitive(json, 'total_tokens');

  let genericTokens = null;
  if (rootPrompt !== undefined || rootComp !== undefined) {
    genericTokens = (safeNumber(rootPrompt) || 0) + (safeNumber(rootComp) || 0);
  } else if (rootTotal !== undefined) {
    genericTokens = safeNumber(rootTotal);
  }

  const rootDur =
    findKeyCaseInsensitive(json, 'durationMs') ||
    findKeyCaseInsensitive(json, 'duration_ms') ||
    findKeyCaseInsensitive(json, 'duration') ||
    findKeyCaseInsensitive(json, 'time') ||
    findKeyCaseInsensitive(json, 'elapsed') ||
    findKeyCaseInsensitive(json, 'elapsedTime') ||
    findKeyCaseInsensitive(json, 'elapsed_time');
  const genericTime = rootDur !== undefined ? safeNumber(rootDur) : null;

  if (buildTokens === null && genericTokens !== null) {
    buildTokens = genericTokens;
  }
  if (buildTime === null && genericTime !== null) {
    buildTime = genericTime;
  }

  return { buildTokens, buildTime };
}

/**
 * Parse raw text format log content.
 */
function parseTextLog(text) {
  let buildTokens = null;
  let buildTime = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const isBuildLine = /build/i.test(line);

    // check tokens
    const tokensMatch =
      /\b(?:tokens?\s+used|token\s+count|tokens|total\s+tokens|prompt\s+tokens|completion\s+tokens|input\s+tokens|output\s+tokens)\b\s*:\s*(\d+)/i.exec(
        line
      );
    if (tokensMatch) {
      const val = parseInt(tokensMatch[1], 10);
      if (isBuildLine || buildTokens === null) {
        buildTokens = val;
      }
    }

    // check time
    const timeMatch = /\b(?:elapsed\s+time|duration|time|elapsed)\b\s*:\s*(\d+)(?:\s*ms)?/i.exec(
      line
    );
    if (timeMatch) {
      const val = parseInt(timeMatch[1], 10);
      if (isBuildLine || buildTime === null) {
        buildTime = val;
      }
    }
  }

  // Global regex fallback if no line-by-line matched
  if (buildTokens === null && buildTime === null) {
    const tokensUsedMatch = /\btokens\s+used\b:\s*(\d+)/i.exec(text);
    if (tokensUsedMatch) {
      buildTokens = parseInt(tokensUsedMatch[1], 10);
    }
    const elapsedMatch = /\belapsed\s+time\b:\s*(\d+)(?:\s*ms)?/i.exec(text);
    if (elapsedMatch) {
      buildTime = parseInt(elapsedMatch[1], 10);
    }
  }

  return { buildTokens, buildTime };
}

// --- Main Execution ---

function main() {
  const options = {
    id: { type: 'string' },
    model: { type: 'string' },
    tool: { type: 'string' },
    'tool-build': { type: 'string' },
    'build-tokens': { type: 'string' },
    'build-time': { type: 'string' },
    'session-log': { type: 'string' },
  };

  let values;
  try {
    const parsed = parseArgs({
      options,
      strict: true,
    });
    values = parsed.values;
  } catch (err) {
    console.error(`Error parsing arguments: ${err.message}`);
    process.exit(1);
  }

  const repoRoot = path.resolve(__dirname, '..');

  // Validate ID
  const id = values.id;
  if (!id || typeof id !== 'string') {
    console.error('Error: --id <one-shot-name> is required.');
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(id)) {
    console.error(`Error: invalid ID "${id}". ID must match kebab-case format (/^[a-z0-9-]+$/).`);
    process.exit(1);
  }

  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    console.error('Error: Path traversal or invalid characters detected in ID.');
    process.exit(1);
  }
  if (/[;&|`$]/.test(id)) {
    console.error('Error: Invalid characters detected in ID.');
    process.exit(1);
  }

  // Validate Numeric Arguments
  validateNumericArg(values['build-tokens'], 'build-tokens');
  validateNumericArg(values['build-time'], 'build-time');

  // Parse session log if provided
  let parsedBuildTokens = null;
  let parsedBuildTime = null;
  let parsedModel = null;
  let parsedTool = null;
  let parsedToolBuild = null;

  if (values['session-log']) {
    const logPath = path.resolve(values['session-log']);
    const relativeLogPath = path.relative(repoRoot, logPath);
    if (relativeLogPath.startsWith('..') || path.isAbsolute(relativeLogPath)) {
      console.error(
        `Error: Session log path traversal detected: "${values['session-log']}" is outside the workspace.`
      );
      process.exit(1);
    }

    if (!fs.existsSync(logPath)) {
      console.error(`Error: Session log file not found at ${logPath}`);
      process.exit(1);
    }

    let logContent;
    try {
      logContent = fs.readFileSync(logPath, 'utf8');
    } catch (err) {
      console.error(`Error reading session log file: ${err.message}`);
      process.exit(1);
    }

    // Try JSON
    let isJson = false;
    let jsonLog = null;
    try {
      jsonLog = JSON.parse(logContent);
      isJson = true;
    } catch (err) {
      isJson = false;
    }

    if (isJson && jsonLog) {
      const parsed = parseJsonLog(jsonLog);
      parsedBuildTokens = parsed.buildTokens;
      parsedBuildTime = parsed.buildTime;

      const m = findKeyCaseInsensitive(jsonLog, 'model');
      if (m !== undefined && m !== null) parsedModel = String(m);

      const t = findKeyCaseInsensitive(jsonLog, 'tool');
      if (t !== undefined && t !== null) parsedTool = String(t);

      const tb =
        findKeyCaseInsensitive(jsonLog, 'toolBuild') ||
        findKeyCaseInsensitive(jsonLog, 'tool_build') ||
        findKeyCaseInsensitive(jsonLog, 'tool-build');
      if (tb !== undefined && tb !== null) parsedToolBuild = String(tb);
    } else {
      const parsed = parseTextLog(logContent);
      parsedBuildTokens = parsed.buildTokens;
      parsedBuildTime = parsed.buildTime;

      const modelMatch = /model\s*:\s*([^\r\n]+)/i.exec(logContent);
      if (modelMatch) parsedModel = modelMatch[1].trim();

      const toolMatch = /tool\s*:\s*([^\r\n]+)/i.exec(logContent);
      if (toolMatch) parsedTool = toolMatch[1].trim();

      const toolBuildMatch = /(?:tool\s+build|tool_build|tool-build)\s*:\s*([^\r\n]+)/i.exec(
        logContent
      );
      if (toolBuildMatch) parsedToolBuild = toolBuildMatch[1].trim();
    }
  }

  // Resolve overrides
  const finalModel =
    values.model !== undefined ? values.model : parsedModel !== null ? parsedModel : '';
  const finalTool = values.tool !== undefined ? values.tool : parsedTool !== null ? parsedTool : '';
  const finalToolBuild =
    values['tool-build'] !== undefined
      ? values['tool-build']
      : parsedToolBuild !== null
        ? parsedToolBuild
        : '';

  const finalBuildTokens =
    values['build-tokens'] !== undefined ? parseInt(values['build-tokens'], 10) : parsedBuildTokens;
  const finalBuildTime =
    values['build-time'] !== undefined ? parseInt(values['build-time'], 10) : parsedBuildTime;

  // Resolve directory and manifest path
  const targetDir = path.join(repoRoot, 'one-shots', id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`Error: One-shot directory not found at ${targetDir}`);
    process.exit(1);
  }

  const manifestPath = path.join(targetDir, 'oneshot.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: oneshot.json not found at ${manifestPath}`);
    process.exit(1);
  }

  // Validate final resolved values before modifying oneshot.json
  function isNonNegativeFiniteIntOrNull(val) {
    if (val === null || val === undefined) return true;
    return Number.isInteger(val) && Number.isFinite(val) && val >= 0;
  }

  if (!isNonNegativeFiniteIntOrNull(finalBuildTokens)) {
    console.error(
      `Error: Invalid final build tokens: "${finalBuildTokens}". Must be a non-negative, finite integer (or null).`
    );
    process.exit(1);
  }
  if (!isNonNegativeFiniteIntOrNull(finalBuildTime)) {
    console.error(
      `Error: Invalid final build time: "${finalBuildTime}". Must be a non-negative, finite integer (or null).`
    );
    process.exit(1);
  }

  // Set up write lock path and helper
  const lockPath = path.join(targetDir, 'oneshot.json.lock');
  let hasLock = false;

  function cleanupLock() {
    if (hasLock) {
      try {
        fs.rmdirSync(lockPath);
      } catch (err) {
        // ignore
      }
      hasLock = false;
    }
  }

  // Register cleanup lock on exit
  process.on('exit', cleanupLock);

  // Acquire write lock
  let lockAcquired = false;
  for (let i = 0; i < 20; i++) {
    try {
      fs.mkdirSync(lockPath);
      hasLock = true;
      lockAcquired = true;
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Wait 50ms synchronously
        const start = Date.now();
        while (Date.now() - start < 50) {}
      } else {
        console.error(`Error: Failed to create lock directory: ${err.message}`);
        process.exit(1);
      }
    }
  }

  if (!lockAcquired) {
    console.error(`Error: Could not acquire write lock on ${lockPath} after 20 attempts.`);
    process.exit(1);
  }

  // Read and parse manifest
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(content);
  } catch (err) {
    console.error(`Error: Failed to parse oneshot.json: ${err.message}`);
    cleanupLock();
    process.exit(1);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    console.error('Error: oneshot.json must be a JSON object.');
    cleanupLock();
    process.exit(1);
  }

  if (!Array.isArray(manifest.attempts)) {
    manifest.attempts = [];
  }

  // Auto detect environment
  let osName = os.type();
  if (osName === 'Windows_NT') {
    osName = 'Windows';
  } else if (osName === 'Darwin') {
    osName = 'macOS';
  }
  const osBuild = os.release();

  // Create attempt entry
  const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const attemptEntry = {
    id: attemptId,
    timestamp: new Date().toISOString(),
    model: finalModel,
    environment: {
      tool: finalTool,
      toolBuild: finalToolBuild,
      os: osName,
      osBuild: osBuild,
    },
    build: {
      tokens: finalBuildTokens !== undefined && finalBuildTokens !== null ? finalBuildTokens : null,
      durationMs: finalBuildTime !== undefined && finalBuildTime !== null ? finalBuildTime : null,
    },
    // This is the untrusted self-report/heuristic path. Tokens and timing here
    // are supplied by an agent/human or scraped from a log, so the attempt is
    // marked manual_attestation and is NOT benchmark-eligible. For trusted,
    // evidence-backed attempts use scripts/record-evidence.js with the
    // llm-usage-reader ledger. See tools/llm-usage-reader/DESIGN-rationale.md.
    evidence: {
      evidenceLevel: 'manual_attestation',
      tokensSource: values['session-log'] ? 'heuristic_log_scrape' : 'manual_attestation',
      timingSource: 'manual_attestation',
      recorder: 'record-attempt.js',
    },
    benchmarkEligible: false,
    evaluation: {
      method: 'none',
      fidelityScore: null,
      passed: null,
      feedback: '',
      evaluatedAt: null,
    },
  };

  manifest.attempts.push(attemptEntry);

  // Atomic write to temporary file first, then rename
  const tmpPath = path.join(targetDir, `oneshot.json.tmp.${process.pid}.${Date.now()}`);

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing temporary file: ${err.message}`);
    cleanupLock();
    process.exit(1);
  }

  let writeSuccess = false;
  let lastError = null;

  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmpPath, manifestPath);
      writeSuccess = true;
      break;
    } catch (err) {
      lastError = err;
      // Wait 50ms synchronously
      const start = Date.now();
      while (Date.now() - start < 50) {}
    }
  }

  if (!writeSuccess) {
    console.error(
      `Error replacing manifest file after 5 attempts: ${lastError ? lastError.message : 'unknown error'}`
    );
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (unlinkErr) {
      console.error(`Failed to clean up temp file: ${unlinkErr.message}`);
    }
    cleanupLock();
    process.exit(1);
  }

  console.log(`Successfully recorded attempt ${attemptId} for ${id}`);
  cleanupLock();
  process.exit(0);
}

main();
