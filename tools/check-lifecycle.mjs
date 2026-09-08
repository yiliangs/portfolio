// Checks that no method in the logic class is defined twice, and that the one componentDidUpdate still calls
// every pass a render owes the page.
//
// The class body is one long list of methods. A class body is not an object literal: a second definition of a
// name does not merge with the first, it silently replaces it, and nothing in the browser or the build says so.
// That is what happened between a052bbc and #62. componentDidUpdate was written a second time further down the
// body, and from then on no render ran measureTabs, syncHome or syncParchment. The tab underline stayed on the
// register the reader had just left, the home cube stayed drawn over a landing, and the roll stayed at the pose
// the previous view gave it. Every one of those reads as a separate rendering fault, so the search goes to the
// drawing code and never to the method list.
//
// Two things are held here. First, a name defined more than once at class-body indent is a failure whatever the
// name is: the shadowing is never intended and the failure it produces never points back at itself. Second, the
// surviving componentDidUpdate has to name the passes a render depends on, because a definition that is unique
// but has lost half its body fails in exactly the same way as a duplicate.
//
// Takes an optional source path as the first argument, so the check can be pointed at an older revision of the
// file to show what it catches. Run with `npm run check`. Exits non-zero and prints every failure it found.

import { readFileSync } from 'node:fs';

const SRC = process.argv[2] || 'design/Portfolio.dc.html';

const failures = [];
const fail = (msg) => failures.push(msg);

const src = readFileSync(SRC, 'utf8');
const closeAt = src.lastIndexOf('</x-dc>');
if (closeAt < 0) {
  console.error('check-lifecycle: no <x-dc> block in ' + SRC);
  process.exit(1);
}
const logicSrc = src.slice(closeAt);

// A member of the class sits at exactly two-space indent and opens its body on the same line as its signature.
// Anything deeper belongs to a method body, and these keywords are statements that happen to be followed by a
// parenthesis, not methods.
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else', 'with', 'typeof']);
const lines = logicSrc.split('\n');
const seen = new Map();
lines.forEach((line, i) => {
  const m = /^ {2}(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.exec(line);
  if (!m) return;
  const name = m[1];
  if (KEYWORDS.has(name)) return;
  if (!seen.has(name)) seen.set(name, []);
  seen.get(name).push(i + 1);
});

if (!seen.size) {
  console.error('check-lifecycle: found no methods at class-body indent in ' + SRC + '; the scan is broken, not the file');
  process.exit(1);
}

for (const [name, at] of seen) {
  if (at.length > 1) {
    fail(name + ' is defined ' + at.length + ' times, at lines ' + at.join(' and ') + '. In a class body the last ' +
      'definition wins and the earlier ones are dropped without a word, so everything the earlier body did stops ' +
      'happening');
  }
}

// ------------------------------------------------------------------ what a render owes the page

// Each of these reads the DOM the render just produced and writes back the part of the page that cannot be
// expressed as markup: the underline under the current tab, the parchment roll's pose, the home cube's layer,
// the captions pulled back inside the hero, the text effects, the reveal observers, the paper, the statement.
const OWED = ['measureTabs', 'syncParchment', 'syncHome', 'placeLeafText', 'mountTextEffects', 'observeReveals',
  'syncPaper', 'measureLandingStatement'];

// the last definition is the one that survives, so that is the body to read
const declAt = logicSrc.lastIndexOf('\n  componentDidUpdate(');
if (declAt < 0) {
  fail('the logic class has no componentDidUpdate, so nothing runs after a render');
} else {
  const open = logicSrc.indexOf('{', declAt);
  const nl = logicSrc.indexOf('\n', open);
  const multi = logicSrc.indexOf('\n  }', open);
  // a one-line method ends at its own newline; a multi-line one at the two-space closing brace
  const end = nl > 0 && nl < multi ? nl : multi;
  const body = logicSrc.slice(open + 1, end < 0 ? logicSrc.length : end);
  for (const name of OWED) {
    if (!new RegExp('\\b' + name + '\\s*\\(').test(body)) {
      fail('componentDidUpdate never calls ' + name + '. A render that does not run it leaves that pass showing ' +
        'the previous view');
    }
  }
}

// ------------------------------------------------------------------ report

if (failures.length) {
  console.error('check-lifecycle: ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's') + ' in ' + SRC);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-lifecycle: ' + seen.size + ' methods in the logic class, each defined once, and componentDidUpdate ' +
  'still runs all ' + OWED.length + ' passes a render owes the page');
