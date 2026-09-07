# Portfolio — Claude Code Instructions

## Branch Rules
- **Never push directly to `host`** — it is the live GitHub Pages deployment branch.
- Make changes on a feature or dev branch, then merge into `host` only when ready to publish.

## Build
- `index.html` and `app.js` are **generated**. Do not edit them; the next build overwrites both.
- The source is `design/Portfolio.dc.html`, the Claude Design handoff: an HTML template in a small
  binding language (`{{ path }}`, `sc-if`, `sc-for`, `style-hover`) plus a logic class.
- Edit that file, then run `npm run build` (`tools/build-dc.mjs`) and commit the regenerated pair.
- The compiler turns the template into `React.createElement` calls and copies the logic class
  through verbatim, so the shipped page carries no template runtime. `tools/build-dc.mjs` documents
  which part of the original runtime each rule came from.
- Everything under `vendor/` is a pinned third-party file. The site loads no code from a CDN.
