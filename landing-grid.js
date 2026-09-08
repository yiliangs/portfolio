// Where the plates of the Development landing fall on the drawing grid.
//
// The desktop landing is one sheet of 22 columns and 44px rows running to the viewport edges. The
// statement, the platform and the three contact cells are drawn by hand, in LANDING_WIDE in the
// logic class; everything else is a plate, and a plate without a pin has no fixed home. It is put on
// a whole cell somewhere on the sheet, the way evidence gets pinned to a board, and that placing is a
// seeded draw rather than a table, so the register reads as a working surface instead of a layout.
//
// A plate may also be pinned by hand, in LANDING_PINS, and then it is not drawn at all: it is filled
// in before the draw runs, so what the draw arranges is whatever is left of the sheet. That is the
// one thing here worth being careful about. Pins take room away from the draw, and a sheet with
// enough of them, or with one in the wrong place, is a sheet the remaining plates cannot be fitted
// on; placeLanding grows and then gives up, which the caller has to report rather than swallow.
//
// The draw is a pure function of its arguments. One seed is taken per page load and kept, so hover,
// scroll and tab switches all re-render the same composition, and a grid that has to grow reruns the
// whole placement from that same seed rather than reshuffling around the new row. Sizes are drawn for
// every plate, pinned ones included, so pinning a plate does not resize the others and unpinning it
// gives it back the size it had.
//
// What the placement holds to, and what tools/check-landing-grid.mjs enforces:
//   - every plate lies wholly inside the grid, on whole cells
//   - no two modules overlap, and at least one empty cell stands between any two of them
//   - the contact band is the grid's last row, so growth carries it down instead of running it over
//   - a pinned plate is where its pin says, exactly
//   - the same arguments give the same answer, every time
//
// The second of those is the strict reading, and it is the one every visitor gets. `strict: false` is
// the other one, asked for only by the page behind ?dev, where the tuning panel has pinned every
// plate and a drag carries one of them across its neighbours on the way to wherever it is going.
// Refusing that composition takes the whole landing off the page, including the plate under the
// cursor, which is no way to compose; so under the loose reading a pin is taken as written, over
// whatever it lands on. Everything else about a pin still holds, since a pin off the grid or on half
// a cell is not a composition anyone meant. The plates still left to the draw keep their empty cell
// from everything already on the sheet either way: the licence is the pins', not the draw's.
//
// placeLanding(opts) -> { rows, grew, plates: [{ col, row, w, h, pinned }], contact: { col, row, w } | null }
// col and row are 1-based grid lines; w and h are counts of cells, so a plate spans the grid columns
// col .. col + w.

// A plate is at least three cells wide, because its title strip is a line of type, and at least
// three tall, because the strip takes the last of its rows and the picture wants the rest. The
// first plate is the platform itself, which is shown larger than the parts of it.
export const PLATE_VOCAB = [[3, 3], [4, 3], [3, 4], [4, 4]];
export const FIRST_PLATE = [5, 4];

// mulberry32: a 32-bit seeded generator, small enough to read and good enough to scatter plates
function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One run of the draw at a fixed number of rows. Returns the plates, or null when a plate could not
// be pinned anywhere within its allowance of tries, which is the caller's signal to grow the sheet.
function attempt(seed, cols, rows, count, reserved, contact, vocab, first, tries, pins, strict) {
  const rand = mulberry32(seed);

  // Sizes are drawn before any position, so growing the sheet moves the plates without resizing
  // them: only the positions come from the part of the sequence the row count can change. A pinned
  // plate draws its size too and then throws it away for the pin's own, so pinning one plate leaves
  // every other plate the size it was.
  const sizes = [];
  for (let i = 0; i < count; i++) {
    sizes.push(i === 0 && first ? first : vocab[Math.floor(rand() * vocab.length)]);
  }

  const taken = new Uint8Array((cols + 2) * (rows + 2));
  const at = (c, r) => r * (cols + 2) + c;
  // a cell is held or it is not, so marking one twice is the same as marking it once: two pins may
  // claim the same cell under the loose reading and the draw still has to see it as one held cell
  const fill = (b) => {
    for (let r = b.row; r < b.row + b.h; r++) {
      for (let c = b.col; c < b.col + b.w; c++) taken[at(c, r)] = 1;
    }
  };
  // free() is where the one-cell gap lives: a box is tested with its own cells and the ring of cells
  // around it, so two modules can never end up sharing an edge or a corner. The ring is clipped at
  // the sheet's edges, so a plate may sit flush against them.
  const free = (b) => {
    if (b.col < 1 || b.row < 1 || b.col + b.w > cols + 1 || b.row + b.h > rows + 1) return false;
    for (let r = b.row - 1; r <= b.row + b.h; r++) {
      if (r < 1 || r > rows) continue;
      for (let c = b.col - 1; c <= b.col + b.w; c++) {
        if (c < 1 || c > cols) continue;
        if (taken[at(c, r)]) return false;
      }
    }
    return true;
  };

  for (const b of reserved) fill(b);
  if (contact) fill({ col: contact.col, row: rows, w: contact.w, h: 1 });

  const plates = new Array(count).fill(null);
  // Pins first, all of them, before a single cell is drawn: what the draw is arranging is the sheet
  // the pins have already taken their share of. A pin that will not go in at this row count is not
  // an error here, it is the signal to grow, because the contact band and the sheet's own bottom edge
  // both move when the sheet does. Pins that cannot coexist at any size of sheet are caught before
  // this function runs. Under the loose reading a pin does not have to go in at all: it goes where it
  // says, over whatever is there, and the row it needs was already counted into this sheet's height
  // by the grow loop, so there is nothing left here for the free() test to say.
  for (let i = 0; i < count; i++) {
    const p = pins[i];
    if (!p) continue;
    const box = { col: p.col, row: p.row, w: p.w, h: p.h, pinned: true };
    if (strict && !free(box)) return null;
    fill(box);
    plates[i] = box;
  }
  for (let i = 0; i < count; i++) {
    if (plates[i]) continue;
    const [w, h] = sizes[i];
    if (w > cols || h > rows) return null;
    let placed = null;
    for (let t = 0; t < tries && !placed; t++) {
      const col = 1 + Math.floor(rand() * (cols - w + 1));
      const row = 1 + Math.floor(rand() * (rows - h + 1));
      const box = { col, row, w, h, pinned: false };
      if (free(box)) placed = box;
    }
    if (!placed) return null;
    fill(placed);
    plates[i] = placed;
  }
  return plates;
}

// true when the two boxes have at least one empty cell between them on every axis they meet on,
// which is the gap free() enforces cell by cell. Used ahead of the draw, where there is no grid to
// mark up yet, to say which pins simply cannot stand together.
const apart = (a, b) =>
  a.col + a.w < b.col || b.col + b.w < a.col || a.row + a.h < b.row || b.row + b.h < a.row;

// A pin is a claim on cells, so a claim that is off the sheet or that another claim already holds is
// a composition nobody can draw, at any size of sheet. Saying so here, by name, is the difference
// between a message the tuning panel can put in front of the person who made the pin and a landing
// that grows eighty rows and then renders no plates at all.
function readPins(pins, count, cols, reserved, strict) {
  const out = new Array(count).fill(null);
  for (const [key, p] of Object.entries(pins || {})) {
    if (!p) continue; // a sparse array of pins reads back here with holes in it
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new Error('landing-grid: a pin names plate ' + key + ', and there are ' + count);
    for (const v of ['col', 'row', 'w', 'h']) {
      if (!Number.isInteger(p[v])) throw new Error('landing-grid: the pin on plate ' + i + ' has a fractional or missing ' + v + ': ' + p[v]);
    }
    if (p.w < 1 || p.h < 1) throw new Error('landing-grid: the pin on plate ' + i + ' is ' + p.w + ' by ' + p.h + ' cells');
    if (p.col < 1 || p.col + p.w > cols + 1) throw new Error('landing-grid: the pin on plate ' + i + ' runs off the ' + cols + ' column grid at ' + p.col + ' / ' + (p.col + p.w));
    if (p.row < 1) throw new Error('landing-grid: the pin on plate ' + i + ' starts above row 1');
    out[i] = { col: p.col, row: p.row, w: p.w, h: p.h };
  }
  // Everything above is true of a pin under either reading: a claim on half a cell, or on cells the
  // sheet does not have, is not a composition anyone meant and there is nothing to draw from it.
  // What follows is the strict reading alone, where a pin also has to be able to stand beside the
  // pins already made. A tuning session is composing, so it asks for the other one.
  if (!strict) return out;
  for (let i = 0; i < count; i++) {
    if (!out[i]) continue;
    for (const r of reserved) {
      if (!apart(out[i], r)) throw new Error('landing-grid: the pin on plate ' + i + ' lands on the statement block, which is drawn before any plate');
    }
    for (let j = i + 1; j < count; j++) {
      if (out[j] && !apart(out[i], out[j])) throw new Error('landing-grid: the pins on plates ' + i + ' and ' + j + ' claim the same cells, or touch with no empty cell between them');
    }
  }
  return out;
}

export function placeLanding(opts) {
  const {
    seed = 0, cols = 22, rows, count, reserved = [], contact = null,
    vocab = PLATE_VOCAB, first = FIRST_PLATE, tries = 600, maxGrow = 80, pins = {}, strict = true,
  } = opts || {};
  if (!(rows > 0) || !(count >= 0)) throw new Error('landing-grid: placeLanding needs a row count and a plate count');
  const pinned = readPins(pins, count, cols, reserved, strict);
  // A pin below the sheet's current last row is not a conflict, it is a taller sheet: start the grow
  // loop deep enough to hold the deepest pin rather than spending the whole allowance climbing to it.
  // Only as deep as the pin itself, and no allowance for the contact band beneath it: the band is six
  // columns of the twenty-two, so a plate low on the left of the sheet may sit on its row and often
  // does. Whether this particular sheet needs another row for it is what growing is for.
  const deep = pinned.reduce((n, p) => (p ? Math.max(n, p.row + p.h - 1) : n), 0);
  const from = Math.max(rows, deep);
  for (let r = from; r <= from + maxGrow; r++) {
    const plates = attempt(seed >>> 0, cols, r, count, reserved, contact, vocab, first, tries, pinned, strict);
    if (plates) {
      return {
        rows: r, grew: r - rows, plates,
        contact: contact ? { col: contact.col, row: r, w: contact.w } : null,
      };
    }
  }
  const held = pinned.filter(Boolean).length;
  throw new Error('landing-grid: ' + (count - held) + ' of ' + count + ' plates would not fit on ' + cols + ' columns within ' +
    (from + maxGrow) + ' rows' + (held ? ', around ' + held + ' pinned' : ''));
}
