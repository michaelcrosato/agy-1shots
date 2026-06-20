#!/usr/bin/env node
'use strict';

/**
 * json-repair
 *
 * Repairs common "JSONC" deviations — `//` line comments, block comments, and
 * trailing commas — into strict, valid JSON. String-aware: comment markers and
 * commas *inside* string literals are preserved. Dependency-free.
 *
 * Scope is deliberately narrow and well-defined so the contract is objective
 * (see verify.js). It does NOT attempt single-quote or unquoted-key recovery,
 * because those cannot be done unambiguously without a full grammar.
 */

/**
 * Return `input` with comments stripped and trailing commas removed, in a
 * single string-aware pass.
 * @param {string} input
 * @returns {string}
 */
function cleanJsonc(input) {
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  let out = '';
  let i = 0;
  const n = input.length;
  // pendingComma: index in `out` of a comma we have emitted but might need to
  // retract if the next significant char turns out to be } or ].
  let pendingCommaAt = -1;

  while (i < n) {
    const c = input[i];

    // String literal (double-quoted, JSON's only string form): copy verbatim.
    if (c === '"') {
      pendingCommaAt = -1;
      out += c;
      i++;
      while (i < n) {
        const d = input[i];
        out += d;
        i++;
        if (d === '\\') {
          // copy the escaped char too
          if (i < n) {
            out += input[i];
            i++;
          }
        } else if (d === '"') {
          break;
        }
      }
      continue;
    }

    // Line comment
    if (c === '/' && input[i + 1] === '/') {
      i += 2;
      while (i < n && input[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (c === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Whitespace: copy, does not cancel a pending comma decision.
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      out += c;
      i++;
      continue;
    }

    if (c === ',') {
      pendingCommaAt = out.length;
      out += c;
      i++;
      continue;
    }

    // Any other significant char: if it closes a container and we have a
    // pending comma, retract the comma (it was trailing).
    if ((c === '}' || c === ']') && pendingCommaAt !== -1) {
      out = out.slice(0, pendingCommaAt) + out.slice(pendingCommaAt + 1);
    }
    pendingCommaAt = -1;
    out += c;
    i++;
  }

  return out;
}

/**
 * Repair JSONC text and return the parsed value. Throws if the result is still
 * not valid JSON (we never return a partial guess).
 * @param {string} input
 * @returns {*} parsed JSON value
 */
function repairJson(input) {
  const cleaned = cleanJsonc(input);
  return JSON.parse(cleaned);
}

/**
 * Repair JSONC text and return a normalized, pretty-printed valid-JSON string.
 * @param {string} input
 * @returns {string}
 */
function repairJsonToString(input) {
  return JSON.stringify(repairJson(input), null, 2);
}

function main(argv) {
  const fs = require('fs');
  const file = argv[2];
  let input;
  if (file) {
    input = fs.readFileSync(file, 'utf8');
  } else {
    input = fs.readFileSync(0, 'utf8'); // stdin
  }
  try {
    process.stdout.write(repairJsonToString(input) + '\n');
  } catch (e) {
    console.error(`json-repair: could not repair to valid JSON — ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { cleanJsonc, repairJson, repairJsonToString };
