// Reads the register's entries out of design/Portfolio.dc.html without running the logic class.
//
// `data` is one flat array of object literals holding both registers, and `reg(i)` routes an entry
// by its kind: Research, Writing and Essay take the serif chapter, everything else takes the mono
// Development sheet. Several checks need that split, and a hand-kept copy of the count in each of
// them would drift the moment an entry is added, so the split is read here once.
//
// The array is a plain literal on purpose, the way SHEET_WIDE and TEXT_FX are, so it can be
// evaluated on its own. Nothing in it is a function or a reference to the class around it.

import { readFileSync } from 'node:fs';

export const DC_SOURCE = 'design/Portfolio.dc.html';

// The logic class is everything after the template, which is what the other checks call logicSrc.
export function readLogicSource(path = DC_SOURCE) {
  const src = readFileSync(path, 'utf8');
  const closeAt = src.lastIndexOf('</x-dc>');
  if (closeAt < 0) throw new Error('no <x-dc> block in ' + path);
  return src.slice(closeAt);
}

export function readEntries(logicSrc = readLogicSource()) {
  const at = logicSrc.indexOf('\n  data = [');
  if (at < 0) throw new Error('the logic class has no data array');
  const open = logicSrc.indexOf('[', at);
  const end = logicSrc.indexOf('\n  ];', open);
  if (end < 0) throw new Error('the data array is not closed with "  ];" so it cannot be read');
  const literal = logicSrc.slice(open, end + 4);
  let entries;
  try {
    entries = new Function('return ' + literal)();
  } catch (e) {
    throw new Error('the data array is not a plain literal this reader can evaluate: ' + e.message);
  }
  if (!Array.isArray(entries) || !entries.length) throw new Error('the data array read back empty');
  return entries;
}

// A placement table (SHEET_WIDE, SHEET_NARROW, LANDING_WIDE) as { module: { col, row } }. This one
// throws on anything it cannot read, so a caller that only wants to consume a table already known
// good does not have to repeat the reporting; tools/check-sheet-grid.mjs keeps its own lenient
// reader because guarding what could hide in the table is its whole job.
export function readTable(name, logicSrc = readLogicSource()) {
  const at = logicSrc.indexOf('  ' + name + ' = {');
  if (at < 0) throw new Error('the logic class has no ' + name + ' placement table');
  const end = logicSrc.indexOf('\n  };', at);
  if (end < 0) throw new Error(name + ' is not closed with "  };" so it cannot be read');
  const entry = /^\s*([A-Za-z_$][\w$]*):\s*\{\s*col:\s*'([^']*)',\s*row:\s*'([^']*)'\s*\},?\s*$/;
  const table = {};
  for (const line of logicSrc.slice(at, end).split('\n').slice(1)) {
    const m = entry.exec(line);
    if (m) table[m[1]] = { col: m[2], row: m[3] };
  }
  if (!Object.keys(table).length) throw new Error(name + ' read back empty');
  return table;
}

// A plain object or array literal assigned to a class field, evaluated on its own. readTable knows
// the shape of the placement tables; this one is for a literal whose shape is its own business, such
// as the LINKS adjacency the register's graph closes over.
export function readLiteral(name, logicSrc = readLogicSource()) {
  const m = new RegExp('\\n  ' + name + ' = ([\\[{])').exec(logicSrc);
  if (!m) throw new Error('the logic class has no ' + name + ' literal');
  const open = m.index + m[0].length - 1;
  const close = m[1] === '[' ? '\n  ];' : '\n  };';
  const end = logicSrc.indexOf(close, open);
  if (end < 0) throw new Error(name + ' is not closed with "' + close.trim() + '" so it cannot be read');
  const literal = logicSrc.slice(open, end + close.length - 1);
  try {
    return new Function('return ' + literal)();
  } catch (e) {
    throw new Error(name + ' is not a plain literal this reader can evaluate: ' + e.message);
  }
}

// A plain numeric field of the logic class, so a rule written there can be read back rather than
// copied into a check. The value is an expression, not always a literal.
export function readNumber(name, logicSrc = readLogicSource()) {
  const m = new RegExp('\\n\\s*' + name + ' = ([^;]+);').exec(logicSrc);
  if (!m) throw new Error('the logic class has no ' + name);
  const value = new Function('return (' + m[1] + ')')();
  if (!Number.isFinite(value)) throw new Error(name + ' is not a number: ' + m[1]);
  return value;
}

// reg(i) in the logic class, kept as one line so the two cannot drift apart silently.
export const registerOf = (entry) => (/Research|Writing|Essay/.test(entry.kind) ? 'serif' : 'mono');

export const monoEntries = (entries = readEntries()) => entries.filter((d) => registerOf(d) === 'mono');
