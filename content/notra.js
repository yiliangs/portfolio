// The ACADIA 2025 project paper, block by block, as the chapter body reads it.
// Text is reproduced from the camera-ready manuscript. Three typesetting slips in the
// source are corrected here: a stray full stop after a citation in the introduction, a
// doubled full stop closing the caption of figure 5, and "Kerf-bending" rejoined where
// the manuscript broke it across a line. Loaded on demand by the chapter view, so the
// front page never pays for it.

export default {
  title: "Notra: A Kerf-Bent Polyhedral Timber Frame",
  byline: "Yulun Liu, Yiliang Shao, Yicheng Zhang and Yao Lu",
  blocks: [
    { k: "byline", authors: [
      { t: "Yulun Liu", aff: "Skidmore, Owings & Merrill", eq: true },
      { t: "Yiliang Shao", aff: "Skidmore, Owings & Merrill", eq: true },
      { t: "Yicheng Zhang", aff: "Atelier Pensée" },
      { t: "Yao Lu", aff: "Thomas Jefferson University" }
    ], note: "* Authors contributed equally" },
    { k: "h2", t: "Introduction" },
    { k: "p", r: ["Notra is a kerf-bent timber frame coffee table (Figure 1) that serves as a small-scale prototype for a novel space frame system. It explores an integrated design and fabrication approach that blurs the boundary between nodes and bars in timber space frame structures. The system features curved nodal geometries fabricated from planar timber sheets using three-axis CNC milling and kerf-bending, eliminating the need for molds or custom components typically required for complex joints. Precisely calculated kerf cuts allow the elements to bend to their intended curvature without auxiliary tools. This approach reduces material waste, simplifies fabrication, and enhances accessibility for constructing geometrically intricate frames."] },
    { k: "p", r: ["Building on earlier research in kerf bending (Liu, Lu, and Akbarzadeh 2021; Bhooshan et al. 2020), Notra uses polyhedral graphic statics (PGS) as a form-finding method (Akbarzadeh 2016) to generate a compression-dominant geometry. While demonstrated at the furniture scale, the workflow is applicable to larger structures, offering a material-efficient and cost-effective fabrication strategy."] },
    { k: "h2", t: "Structural Form-Finding" },
    { k: "p", r: ["The base geometry is generated using PolyFrame2, a Rhino plug-in implementing PGS (Nejur and Akbarzadeh 2021; Lu, Hablicsek, and Akbarzadeh 2024). The form consists of 32 polyhedral cells within a 1500 mm × 1500 mm × 500 mm bounding box (Figure 2a, 2b). Edge lengths and face angles are optimized to meet fabrication constraints. All adjacent bars form angles greater than 60 degrees to reduce sharp curvature and excessive kerfing during construction."] },
    { k: "fig", n: 2, src: "assets/notra/fig-02.jpg", w: 1600, h: 686, wide: true, cap: ["Form-finding using polyhedral graphic statics (PGS) and the materialization strategy. (a) The polyhedral force diagram. (b) The form diagram is constrained to a 1500 mm × 1500 mm × 500 mm bounding box. (c) Each edge is materialized as a bar composed of multiple loops. (d) To enlarge node sizes and improve moment resistance, loop corners are filleted with specified radii."], capText: "Form-finding using polyhedral graphic statics (PGS) and the materialization strategy. (a) The polyhedral force diagram. (b) The form diagram is constrained to a 1500 mm × 1500 mm × 500 mm bounding box. (c) Each edge is materialized as a bar composed of multiple loops. (d) To enlarge node sizes and improve moment resistance, loop corners are filleted with specified radii.", alt: "Form-finding using polyhedral graphic statics and the materialization strategy." },
    { k: "h2", t: "Materialization" },
    { k: "p", r: ["The structure adopts a bar-node typology in which each edge is materialized as a bar composed of multiple side elements. These surround planar subspaces in the form diagram, forming closed loops (Figure 2c). To enlarge node sizes and improve moment resistance, loop corners are filleted with specified radii (Figure 2d). Loops are unrolled into straight strips and nested within 1.6 m × 1.9 m plywood panels (20 mm thick) for CNC milling (Figure 3b). Kerf-bending parameters, including cut width, depth, spacing, and number, are calculated from the curvature of the filleted corners (Figure 3a)."] },
    { k: "fig", n: 3, src: "assets/notra/fig-03.jpg", w: 1600, h: 617, wide: true, cap: ["(a) Kerf cut parameters include cut width, depth, spacing, and number. (b) All timber parts can be nested on a 1.9 m by 1.6 m sheet."], capText: "(a) Kerf cut parameters include cut width, depth, spacing, and number. (b) All timber parts can be nested on a 1.9 m by 1.6 m sheet.", alt: "Kerf cut parameters and the nesting of all timber parts on one sheet." },
    { k: "p", r: ["Bar profiles are sized in proportion to internal force magnitudes derived from the PGS diagram. Strip widths vary from 10 mm to 30 mm, with local adjustments along each bar. Side elements are connected using 5 mm thick laser-cut acrylic plates, which serve as anchors to ensure geometric precision and structural continuity."] },
    { k: "p", r: ["Due to plywood’s anisotropic properties, kerf directions are carefully aligned with the grain. Most kerfs cut deep, leaving a three-ply core. Cuts are oriented perpendicular to the bottom layer’s grain, allowing the stronger outer layers to bend along their optimal direction."] },
    { k: "p", r: ["The structural equilibrium of the form diagram is valid only when real-world loads approximate the designed conditions. Two strategies are used to achieve this. Vertical loading is provided by the self-weight of a 6 mm thick glass panel, which also functions as the tabletop. Lateral loading is introduced through six 5 mm diameter steel cables threaded through the acrylic anchor plates, applying inward compression to maintain the designed equilibrium configuration."] },
    { k: "figrow", figs: [
      { k: "fig", n: 4, src: "assets/notra/fig-04.jpg", w: 1600, h: 1067, wide: false, cap: ["Assembled kerf-bent timber frame showcasing curved geometry and node continuity. The glass table top provides vertical loading."], capText: "Assembled kerf-bent timber frame showcasing curved geometry and node continuity. The glass table top provides vertical loading.", alt: "Assembled kerf-bent timber frame under its glass top." },
      { k: "fig", n: 5, src: "assets/notra/fig-05.jpg", w: 1600, h: 1067, wide: false, cap: ["Side view of the frame."], capText: "Side view of the frame.", alt: "Side view of the frame." }
    ] },
    { k: "h2", t: "Fabrication and Assembly" },
    { k: "p", r: ["The process requires no molds or support structures. It begins with three-axis CNC milling of strips (Figure 6a). Hot water is applied to soften the kerf cut regions (Figure 6b), allowing each strip to bend into a closed loop (Figure 6c). Lap joints are overlapped and secured using a nail gun (Figure 6d). Acrylic connectors are inserted into CNC-milled holes to fix side elements in place (Figure 6g)."] },
    { k: "fig", n: 6, src: "assets/notra/fig-06.jpg", w: 1600, h: 1082, wide: true, cap: ["The fabrication and assembly process of Notra. (a) Flattened plywood bars cut with 3-axis CNC router. (b) Application of hot water to facilitate kerf bending. (c) Close-up view of kerfs after bending. (d) Connection of the head and tail of each strip to form a closed loop. (e) All components laid out prior to assembly. (f) Acrylic connectors. (g) Close-up view of acrylic connectors connecting plywood loops. (h) Use of masking tape for temporary fixation. (i) Application of tension cables and bolts to introduce inward compression."], capText: "The fabrication and assembly process of Notra. (a) Flattened plywood bars cut with 3-axis CNC router. (b) Application of hot water to facilitate kerf bending. (c) Close-up view of kerfs after bending. (d) Connection of the head and tail of each strip to form a closed loop. (e) All components laid out prior to assembly. (f) Acrylic connectors. (g) Close-up view of acrylic connectors connecting plywood loops. (h) Use of masking tape for temporary fixation. (i) Application of tension cables and bolts to introduce inward compression.", alt: "The fabrication and assembly process of Notra in nine steps." },
    { k: "p", r: ["Once assembled, polyurethane foam is injected between acrylic components to fill cavities and add reinforcement. Tension cables are threaded through holes in the upper and lower acrylic layers and tightened with bolts (Figure 6i). A glass panel is placed on top to apply downward pressure, balancing the forces from the tension system (Figure 4, 5, 9, 10). Though the kerf voids remain unfilled, the structure demonstrates strong stability, with potential for further improvement using adhesive fillers."] },
    { k: "figrow", figs: [
      { k: "fig", n: 7, src: "assets/notra/fig-07.jpg", w: 1600, h: 1067, wide: false, cap: ["A top view of a top node."], capText: "A top view of a top node.", alt: "A top view of a top node." },
      { k: "fig", n: 8, src: "assets/notra/fig-08.jpg", w: 1600, h: 1067, wide: false, cap: ["A typical node."], capText: "A typical node.", alt: "A typical node." }
    ] },
    { k: "figrow", figs: [
      { k: "fig", n: 9, src: "assets/notra/fig-09.jpg", w: 1600, h: 1067, wide: false, cap: ["Glass tabletop reflects the underlying timber frame."], capText: "Glass tabletop reflects the underlying timber frame.", alt: "Glass tabletop reflecting the timber frame beneath it." },
      { k: "fig", n: 10, src: "assets/notra/fig-10.jpg", w: 1600, h: 1067, wide: false, cap: ["Glass tabletop resting on the timber frame base."], capText: "Glass tabletop resting on the timber frame base.", alt: "Glass tabletop resting on the timber frame base." }
    ] },
    { k: "fold", id: "ack", t: "Acknowledgments", items: [
      ["This project was supported by College of Architecture and the Built Environment, Thomas Jefferson University."]
    ] },
    { k: "fold", id: "credits", t: "Image credits", items: [
      ["Figure 1, 4–10: © Zhikang Liu."],
      ["All other drawings and images by the authors."]
    ] },
    { k: "fold", id: "authors", t: "About the authors", items: [
      ["Yulun Liu is an interdisciplinary designer focused on structural design and spatial efficiency. She is currently an architectural designer at Skidmore, Owings & Merrill (SOM). She holds dual master’s degrees: a Master of Architecture from the University of Pennsylvania and a Master of Structural Engineering from Tianjin University."],
      ["Yiliang Shao is a computational design researcher at Skidmore, Owings & Merrill (SOM), where he is a primary contributor to research initiatives in computational problem solving and building technology innovation. He earned his Master of Architecture from the University of Pennsylvania, concentrating in design research and computation. Before joining SOM, he was part of the Polyhedral Structures Laboratory at Penn, contributing to projects at the intersection of geometry, structural design, and advanced computational methods."],
      ["Yicheng Zhang is an architectural designer and founder of Atelier Pensée. He holds a Master of Architecture degree from the Stuart Weitzman School of Design, University of Pennsylvania and specializes in structural systems and digital fabrication. His work blends technical precision with creative vision to produce aesthetic, innovative, and buildable designs."],
      ["Yao Lu is an Assistant Professor of Architecture at Thomas Jefferson University. His research focuses on computational structural design, digital fabrication, and custom software development. He holds a Ph.D. in Architecture from University of Pennsylvania, an M.S. in Matter Design Computation from Cornell University, and an M.Arch and B.Eng from Tongji University."]
    ] },
    { k: "fold", id: "refs", t: "References", items: [
      [
        "Akbarzadeh, Masoud. 2016. \"3D Graphical Statics Using Reciprocal Polyhedral Diagrams.\" Application/pdf. ETH Zurich. doi:10.3929/ETHZ-A-010867338."
      ],
      [
        "Bhooshan, Vishu, Henry Louth, Leo Bieling, and Shajay Bhooshan. 2020. \"Spatial Developable Meshes.\" In ",
        { i: "Impact: Design With All Senses" },
        ", edited by Christoph Gengnagel, Olivier Baverel, Jane Burry, Mette Ramsgaard Thomsen, and Stefan Weinzierl, 45–58. Cham: Springer International Publishing. doi:10.1007/978-3-030-29829-6_4."
      ],
      [
        "Liu, Yulun, Yao Lu, and Masoud Akbarzadeh. 2021. \"Kerf Bending and Zipper in Spatial Timber Tectonics: A Polyhedral Timber Space Frame System Manufacturable by 3-Axis CNC Milling Machine.\" In ",
        { i: "2021 Association for Computer Aided Design in Architecture Annual Conference, ACADIA 2021, November 3, 2021 - November 6, 2021" },
        ". Association for Computer Aided Design in Architecture Annual Conference, ACADIA 2021. Virtual, Online: ACADIA."
      ],
      [
        "Lu, Yao, Márton Hablicsek, and Masoud Akbarzadeh. 2024. \"Algebraic 3D Graphic Statics with Edge and Vertex Constraints: A Comprehensive Approach to Extend the Solution Space for Polyhedral Form-Finding.\" ",
        { i: "Computer-Aided Design" },
        " 166 (January): 103620. doi:10.1016/j.cad.2023.103620."
      ],
      [
        "Nejur, Andrei, and Masoud Akbarzadeh. 2021. \"PolyFrame, Efficient Computation for 3D Graphic Statics.\" ",
        { i: "Computer-Aided Design" },
        " 134 (May): 103003. doi:10.1016/j.cad.2021.103003."
      ]
    ] },
  ],
};
