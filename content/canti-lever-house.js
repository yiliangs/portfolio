// Canti-Lever House, block by block, as the chapter body reads it.
//
// The source is the competition board issued on 11 November 2025 ("Fall Comp Design Challenge
// Boards.indd"). Every sentence the board sets in type is reproduced here verbatim, in the board's
// own order: the two body paragraphs, the three numbered option captions, and the two plate lines
// under the renders. The connective prose between them was written for this chapter and states only
// what the drawings on the board show: the gridlines A to J, the three stories, which members the
// analysis model colours in tension and which in compression, and the 82-ton baseline the tonnage
// slide records. Nothing about spans, sections or code checks is asserted, because the board does
// not carry it.
//
// Two rules govern the plates, both of them the paper grid's rather than this chapter's:
//
//   * Only a drawing too wide to read at the text measure is `wide`. The six analysis and load-path
//     diagrams run between 4:1 and 6:1 and lose their gridline bubbles at 656px, so they take the
//     full width; every render sits in the text column with its caption beside it. A chapter of
//     full-bleed plates leaves column 2 empty down its whole length, which is the failure this
//     chapter had on its first pass.
//   * A `wide` figure is always followed by a text block, and by one long enough to stand as tall as
//     the caption. renderPaper drops a wide plate's caption into the next row of column 2, on the
//     assumption that a paragraph follows: a second wide plate spans column 2 on that row, so the
//     caption is laid over the drawing, and a two-line paragraph is shorter than the caption, so the
//     row grows as the caption types and shoves the rest of the page down under the cursor. Both were
//     seen here. The other six modules never meet either because their paragraphs are long and never
//     run two plates together; this chapter has to keep the rule on purpose.
//
// The plates are the board's own images at the resolution it carried them, except for the three
// algorithm outputs (fig. 6, 7, 8), which are the optimizer's exports and never made the board. The
// Ezra Stoller photograph of the 1952 building that sits at the head of the board is not reproduced:
// it is a licensed Esto image and is not ours to republish. Fig. 5 is Mozaffari, Akbarzadeh and
// Vogel's own diagram and is credited as such in its caption and in the References fold.
//
// Loaded on demand by the chapter view, so the front page never pays for it.

export default {
  title: "Canti-Lever House",
  byline: "Luke Edwards, Bin Liu, Pablo Ruiz and Yiliang Shao",
  dropCap: true,
  blocks: [
    { k: "byline", authors: [
      { t: "Luke Edwards", aff: "Skidmore, Owings & Merrill" },
      { t: "Bin Liu", aff: "Skidmore, Owings & Merrill" },
      { t: "Pablo Ruiz", aff: "Skidmore, Owings & Merrill" },
      { t: "Yiliang Shao", aff: "Skidmore, Owings & Merrill" }
    ] },

    { k: "abstract", r: ["This proposal reinterprets Lever House’s legacy of transparency by transforming its symbolic floating podium into a true cantilevered structure. The modernist ground plane was conceived as an open, uninterrupted realm: a continuation of the street into the building. Along Park Avenue, Lever House’s levitating glass podium suggested a delicate hover, yet the space beneath was interrupted by columns. ", { i: "Canti-Lever House" }, " realizes this vision structurally, clearing the ground entirely."] },

    { k: "p", r: ["The proposal was made as three structural options carried through one model of the podium, and the board states each of them in a line:"] },

    { k: "ul", items: [
      ["1. The 1952 legacy design. Steel columns support a “levitating” podium."],
      ["2. What if the podium could truly hover? A simple Vierendeel truss increases material quantities by 3X. Compromises clear heights."],
      ["3. Strut-and-tie optimization. An expressive, computationally optimized truss. Reduces material quantities by 30%. Introduces a delicate timber structure."]
    ] },

    { k: "h2", t: "The 1952 legacy design" },

    { k: "p", r: ["Along Park Avenue the podium reads as a plate set down on air. It is not on air. Steel columns come through it on the grid that orders the floors above, land in the open ground, and stand there in the middle of the room the drawing was promising. The hover is a graphic result rather than a structural one, and the uninterrupted realm underneath it is delivered as a colonnade."] },

    { k: "fig", n: 1, src: "assets/canti-lever-house/fig-01.jpg", w: 2000, h: 1125,
      cap: ["The legacy section. The podium hovers, and the columns that make it hover stand in the ground plane it was supposed to open."],
      capText: "The legacy section. The podium hovers, and the columns that make it hover stand in the ground plane it was supposed to open.",
      alt: "A long section render of the podium and the tower above it, the two podium levels carried on a regular file of slender columns that continue down into the open ground below." },

    { k: "p", r: ["Taken as a frame, that is also the cheapest of the three options, and it is the reference the other two are weighed against. Columns run to the base at every gridline from A to J, both podium levels are ordinary beams, and the frame weighs 82 tons."] },

    { k: "fig", n: 2, src: "assets/canti-lever-house/fig-02.jpg", w: 906, h: 233, wide: true,
      cap: ["The baseline frame, gridlines A to J over Base, Story 1 and Story 2. Every gridline carries a column to the ground. Tonnage: 82 tons."],
      capText: "The baseline frame, gridlines A to J over Base, Story 1 and Story 2. Every gridline carries a column to the ground. Tonnage: 82 tons.",
      alt: "An elevation of the analysis model: two horizontal beam lines at Story 1 and Story 2, with a column at each of the ten gridlines running down to a pinned support at the base." },

    { k: "h2", t: "What if the podium could truly hover?" },

    { k: "p", r: ["Take the columns out of the plaza and the podium has to reach the cores on its own. The direct answer is a Vierendeel truss: make the two podium levels into one deep frame, leave the columns standing only at F, G and H, and let the frame carry the cantilevers through its joints rather than through diagonals."] },

    { k: "fig", n: 3, src: "assets/canti-lever-house/fig-03.jpg", w: 2000, h: 1125,
      cap: ["The Vierendeel section. The ground is clear and the podium is now a single deep frame with rectangular openings, which is where the clear height went."],
      capText: "The Vierendeel section. The ground is clear and the podium is now a single deep frame with rectangular openings, which is where the clear height went.",
      alt: "A long section render of the podium rebuilt as one deep frame pierced by a row of rectangular openings, standing clear of the ground except at three central columns." },

    { k: "p", r: ["The model shows what that costs. The upper chord goes into tension along the length of the podium and the lower chord into compression, and with no diagonal to close the triangle the whole depth of both levels has to be spent on the frame. The board records the result in two lines: three times the material of the baseline, and clear heights compromised."] },

    { k: "fig", n: 4, src: "assets/canti-lever-house/fig-04.jpg", w: 2785, h: 680, wide: true,
      cap: ["The Vierendeel option in the analysis model: tension in red along the upper chord, compression in blue along the lower, and columns only at F, G and H."],
      capText: "The Vierendeel option in the analysis model: tension in red along the upper chord, compression in blue along the lower, and columns only at F, G and H.",
      alt: "An elevation of the analysis model showing a two-storey Vierendeel frame, its top chord and outer verticals red, its bottom chord and central verticals blue, supported on three columns that run to the base." },

    { k: "h2", t: "Strut-and-tie optimization" },

    { k: "p", r: ["Using a strut-and-tie optimization algorithm, originally developed by Dr. Salma Mozaffari from ETH Zurich", { sup: "1" }, ", ", { i: "Canti-Lever House" }, " generates a structurally expressive, optimized cantilever truss, allowing the glass podium to truly hover. Compression elements of wood and tension rods of steel liberate the underside of the podium, so the ground plane can flow into it uninterrupted."] },

    { k: "fig", n: 5, src: "assets/canti-lever-house/fig-05.png", w: 321, h: 698,
      cap: ["After Mozaffari, Akbarzadeh and Vogel: (a) the design domain, meshed with every path a load may take, supports at the left and the load at the right; (c) and (e), two load paths returned over that domain, struts in blue and ties in red."],
      capText: "After Mozaffari, Akbarzadeh and Vogel: (a) the design domain, meshed with every path a load may take, supports at the left and the load at the right; (c) and (e), two load paths returned over that domain, struts in blue and ties in red.",
      alt: "Three stacked diagrams of one rectangular design domain: the empty meshed domain with two pinned supports at the left and a downward load arrow at the right, then a dense red and blue load path across it, then a sparser one." },

    { k: "p", r: ["The algorithm is not given a shape to improve. It is given an external equilibrium, which is to say the loads, the supports, and a meshed ground standing for every path a load is allowed to take, and it returns the load-minimizing path through that ground as a form diagram in which each member is a strut or a tie and nothing is asked to bend. Because what comes back is a topology rather than a section, the same setup answers a different question when it is handed a different ground. The same optimizer, applied to a timber structure and reported in full, is the subject of the previous chapter", { sup: "2" }, "."] },

    { k: "p", r: ["Handed the podium, the optimizer fills it. Ties gather along the top where the cantilever wants them and struts fan down and inward to the three columns, and the drawing that comes back is already the architecture: there is no second step in which a structural result is made presentable."] },

    { k: "fig", n: 6, src: "assets/canti-lever-house/fig-06.png", w: 2580, h: 409, wide: true,
      cap: ["The load path returned when the whole depth of the podium is offered as the design domain: ties in red along the top and at the supports, struts in blue fanning down and inward."],
      capText: "The load path returned when the whole depth of the podium is offered as the design domain: ties in red along the top and at the supports, struts in blue fanning down and inward.",
      alt: "A long elevation of the optimized layout over a faint triangulated mesh, red horizontal ties along the top, blue diagonal struts descending and converging toward the supports." },

    { k: "p", r: ["The design domain is an argument in itself. The optimizer will only run a load through ground it has been given, so whatever is withheld from the mesh is withheld from the structure. Holding a volume out of the domain is therefore enough to route the path around that volume rather than through it, and the room the volume stands for survives into the built section. That is how the clear height the Vierendeel spent on its own depth is kept here, and kept without putting anything back on the ground below."] },

    { k: "fig", n: 7, src: "assets/canti-lever-house/fig-07.png", w: 2612, h: 443, wide: true,
      cap: ["The same problem with a volume held out of the design domain. The load path runs around the reserved rectangle rather than through it, so the space it protects stays clear."],
      capText: "The same problem with a volume held out of the design domain. The load path runs around the reserved rectangle rather than through it, so the space it protects stays clear.",
      alt: "The same long elevation, now with a large blank rectangle in the middle of the field and the red and blue members deflected around its edges." },

    { k: "p", r: ["A load path fixes the topology but not the sections. It says which members exist, where they meet, and which of them pull and which push; it says nothing at all about how large any of them has to be. Widening every member in proportion to the force it carries turns the layout into a stress field, at which point the drawing stops being a diagram of intent and becomes the one the members are read off."] },

    { k: "fig", n: 8, src: "assets/canti-lever-house/fig-08.png", w: 2617, h: 476, wide: true,
      cap: ["The optimized layout drawn as a stress field: every strut and tie carries the width of the force in it."],
      capText: "The optimized layout drawn as a stress field: every strut and tie carries the width of the force in it.",
      alt: "A line drawing of the same layout in black and red, each member thickened into a band whose width varies with the force it carries, with rectangular supports at three points." },

    { k: "p", r: ["Back in the analysis model the layout sits on the same gridlines as the other two options, so the comparison is like for like: A to J, Story 2 over Story 1, three columns to the base. The upper chord is in tension and the fanned diagonals are in compression."] },

    { k: "fig", n: 9, src: "assets/canti-lever-house/fig-09.jpg", w: 2437, h: 600, wide: true,
      cap: ["The optimized truss in the analysis model, on the podium’s own gridlines: ties in red along the upper chord, struts in blue fanning down to the columns at F, G and H."],
      capText: "The optimized truss in the analysis model, on the podium’s own gridlines: ties in red along the upper chord, struts in blue fanning down to the columns at F, G and H.",
      alt: "An elevation of the analysis model showing the optimized truss: a red upper chord, dense blue diagonal struts converging on three columns, and a red vertical at each end of the cantilever." },

    { k: "p", r: ["The members are timber where they are compressed and steel rods where they are pulled, which is the point of asking for a load path in which nothing bends. Wood is strong along the grain and awkward everywhere else, so a structure of struts and ties is one it can actually build. The board states the result without qualifying it: material quantities reduced by thirty percent, and a delicate timber structure introduced."] },

    { k: "fig", n: 10, src: "assets/canti-lever-house/fig-10.jpg", w: 2000, h: 1125,
      cap: ["The podium built by that layout. The plaza runs edge to edge without a column in it, and the truss is the ceiling of the room it makes."],
      capText: "The podium built by that layout. The plaza runs edge to edge without a column in it, and the truss is the ceiling of the room it makes.",
      alt: "A long section render of the podium carried on a fine diagonal timber lattice, the ground beneath it entirely clear of structure except at three central columns." },

    { k: "h2", t: "The ground plane, and the room above it" },

    { k: "p", r: ["From the outside, ", { i: "Canti-Lever House" }, " fulfills a foundational modernist ideal: the ground plane as an extension of the public realm, underneath a hovering building."] },

    { k: "fig", n: 11, src: "assets/canti-lever-house/fig-11.jpg", w: 1500, h: 2000,
      cap: ["The podium against the masonry arcade of its neighbour, and the plaza continuing underneath it without interruption."],
      capText: "The podium against the masonry arcade of its neighbour, and the plaza continuing underneath it without interruption.",
      alt: "A worm’s-eye render looking along the glazed underside of the podium as it passes a stone building with an arcade, four figures walking in the clear plaza below." },

    { k: "p", r: ["From the inside, ", { i: "Canti-Lever House" }, " reveals its intricate timber and steel structure: a latticed, warm expression that introduces a new kind of structural expression for the office house of today. The struts cross the floor at eye level under a timber soffit, with the glass wall running behind them, so the thing holding the building up is also the thing furnishing the room."] },

    { k: "fig", n: 12, src: "assets/canti-lever-house/fig-12.jpg", w: 2000, h: 1125,
      cap: ["The podium floor, looking out through the lattice. The struts are the timber, the rods hanging between them are the steel."],
      capText: "The podium floor, looking out through the lattice. The struts are the timber, the rods hanging between them are the steel.",
      alt: "An interior render of a white-furnished lounge under a timber soffit, a lattice of crossing timber struts and slender steel hangers running across the room in front of the glass facade." },

    { k: "fig", n: 13, src: "assets/canti-lever-house/fig-13.jpg", w: 2000, h: 1125,
      cap: ["The same room from the opposite side, the truss reading as furniture-scale structure across a floor with no columns in it."],
      capText: "The same room from the opposite side, the truss reading as furniture-scale structure across a floor with no columns in it.",
      alt: "An interior render across an open office floor, the timber truss fanning out overhead below a warm timber ceiling, workstations and lounge seating beneath it." },

    { k: "fold", id: "refs", t: "References", items: [
      ["1. ", "Mozaffari, S.; Akbarzadeh, M.; Vogel, T. Graphic statics in a continuum: Strut-and-tie models for reinforced concrete. Comput. Struct. 2020, 240, 106335."],
      ["2. ", "Gao, Y.; Shao, Y.; Akbarzadeh, M. Application of Graphic Statics and Strut-and-Tie Models Optimization Algorithm in Innovative Timber Structure Design. Buildings 2023, 13 (12), 2946."]
    ] },
  ],
};
