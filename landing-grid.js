// Where the plates of the Development landing fall on the drawing grid.
//
// The desktop landing is one sheet of 22 columns and 44px rows running to the viewport edges. The
// statement, the platform and the three contact cells are drawn by hand, in LANDING_WIDE in the
// logic class; everything else is a plate, and a plate has no fixed home. It is pinned to a whole
// cell somewhere on the sheet, the way evidence gets pinned to a board, and the pinning is a seeded
// draw rather than a table, so the register reads as a working surface instead of a layout.
//
// The draw is a pure function of its arguments. One seed is taken per page load and kept, so hover,
// scroll and tab switches all re-render the same composition, and a grid that has to grow reruns the
// whole placement from that same seed rather than reshuffling around the new row.
//
// What the placement holds to, and what tools/check-landing-grid.mjs enforces:
//   - every plate lies wholly inside the grid, on whole cells
//   - no two modules overlap, and at least one empty cell stands between any two of them
//   - the contact band is the grid's last row, so growth carries it down instead of running it over
//   - the same arguments give the same answer, every time
//
// placeLanding(opts) -> { rows, grew, plates: [{ col, row, w, h }], contact: { col, row, w } | null }
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
function attempt(seed, cols, rows, count, reserved, contact, vocab, first, tries) {
  const rand = mulberry32(seed);

  // Sizes are drawn before any position, so growing the sheet moves the plates without resizing
  // them: only the positions come from the part of the sequence the row count can change.
  const sizes = [];
  for (let i = 0; i < count; i++) {
    sizes.push(i === 0 && first ? first : vocab[Math.floor(rand() * vocab.length)]);
  }

  const taken = new Uint8Array((cols + 2) * (rows + 2));
  const at = (c, r) => r * (cols + 2) + c;
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

  const plates = [];
  for (let i = 0; i < count; i++) {
    const [w, h] = sizes[i];
    if (w > cols || h > rows) return null;
    let placed = null;
    for (let t = 0; t < tries && !placed; t++) {
      const col = 1 + Math.floor(rand() * (cols - w + 1));
      const row = 1 + Math.floor(rand() * (rows - h + 1));
      const box = { col, row, w, h };
      if (free(box)) placed = box;
    }
    if (!placed) return null;
    fill(placed);
    plates.push(placed);
  }
  return plates;
}

export function placeLanding(opts) {
  const {
    seed = 0, cols = 22, rows, count, reserved = [], contact = null,
    vocab = PLATE_VOCAB, first = FIRST_PLATE, tries = 600, maxGrow = 80,
  } = opts || {};
  if (!(rows > 0) || !(count >= 0)) throw new Error('landing-grid: placeLanding needs a row count and a plate count');
  for (let r = rows; r <= rows + maxGrow; r++) {
    const plates = attempt(seed >>> 0, cols, r, count, reserved, contact, vocab, first, tries);
    if (plates) {
      return {
        rows: r, grew: r - rows, plates,
        contact: contact ? { col: contact.col, row: r, w: contact.w } : null,
      };
    }
  }
  throw new Error('landing-grid: ' + count + ' plates would not fit on ' + cols + ' columns within ' + (rows + maxGrow) + ' rows');
}
