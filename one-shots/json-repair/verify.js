#!/usr/bin/env node
'use strict';

// Acceptance test for json-repair. Exits 0 on pass, 1 on failure.

const { cleanJsonc, repairJson, repairJsonToString } = require('./index.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// trailing comma in object
check('object trailing comma', deepEq(repairJson('{"a":1,}'), { a: 1 }));
// trailing comma in array
check('array trailing comma', deepEq(repairJson('[1, 2, 3, ]'), [1, 2, 3]));
// nested trailing commas
check(
  'nested trailing commas',
  deepEq(repairJson('{"a":[1,2,],"b":{"c":3,},}'), { a: [1, 2], b: { c: 3 } })
);
// line comment
check('line comment', deepEq(repairJson('{\n  "a": 1 // inline\n}'), { a: 1 }));
// block comment
check('block comment', deepEq(repairJson('{/* hdr */ "a": 1}'), { a: 1 }));
// comment markers INSIDE a string are preserved
check(
  'string with // is preserved',
  deepEq(repairJson('{"url": "http://example.com/a,b"}'), { url: 'http://example.com/a,b' })
);
// a comma inside a string before } is NOT treated as trailing
check('comma inside string preserved', deepEq(repairJson('{"s": "a,"}'), { s: 'a,' }));
// escaped quotes inside a value, followed by a real (outside) trailing comma
check(
  'escaped quotes + trailing comma',
  deepEq(repairJson('{"s": "she said \\"hi\\"", }'), { s: 'she said "hi"' })
);
// a comma immediately inside a string (not trailing) is preserved
check('trailing-looking comma inside string', deepEq(repairJson('{"s": "ends,"}'), { s: 'ends,' }));
// already-valid JSON is unchanged in meaning
check('valid JSON round-trips', deepEq(repairJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] }));
// pretty-print output is itself valid JSON
check(
  'repairJsonToString emits valid JSON',
  (() => {
    const s = repairJsonToString('{"a":1,}');
    try {
      return deepEq(JSON.parse(s), { a: 1 });
    } catch (e) {
      return false;
    }
  })()
);
// genuinely broken input (not just JSONC) still throws — no partial guess
check(
  'unrepairable throws',
  (() => {
    try {
      repairJson('{"a": }');
      return false;
    } catch (e) {
      return true;
    }
  })()
);
// cleanJsonc is a no-op on plain JSON text
check('cleanJsonc preserves plain JSON', cleanJsonc('{"a":1}') === '{"a":1}');

if (failures === 0) {
  console.log('\njson-repair: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`\njson-repair: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
