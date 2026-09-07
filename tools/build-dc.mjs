// Compiles design/Portfolio.dc.html into the static site: index.html + app.js.
//
// The design arrives from Claude Design as a `.dc.html` file: an HTML template using a small
// binding language ({{ path }}, sc-if, sc-for, style-hover) plus a logic class, both interpreted
// at page load by the 69KB dc-runtime (support.js), which also re-fetches the whole document to
// re-parse the template. This turns the template into plain React.createElement calls ahead of
// time so the shipped page carries neither the runtime nor the second fetch.
//
// Everything below mirrors the runtime's own semantics, function for function, so the compiled
// output renders the same tree the prototype did. Where a rule looks arbitrary it is because the
// runtime does it that way; the comment says which part of support.js it came from.
//
// Run with `npm run build` after editing design/Portfolio.dc.html. The logic class is copied
// through verbatim; only the template is compiled.

import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = 'design/Portfolio.dc.html';
const OUT_HTML = 'index.html';
const OUT_JS = 'app.js';

const src = readFileSync(SRC, 'utf8');

// ---------------------------------------------------------------- source split

const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
const closeAt = src.lastIndexOf('</x-dc>');
if (!openMatch || closeAt < 0) throw new Error('no <x-dc> block in ' + SRC);
const templateSrc = src.slice(openMatch.index + openMatch[0].length, closeAt);

const scriptMatch = /<script type="text\/x-dc"[^>]*data-props="([^"]*)"[^>]*>([\s\S]*?)<\/script>/.exec(src);
if (!scriptMatch) throw new Error('no logic script in ' + SRC);
const propsMeta = JSON.parse(scriptMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const logicSrc = scriptMatch[2];

// props the template and logic see before renderVals() runs (support.js: __userProps / parseDataProps)
const defaultProps = {};
for (const [k, v] of Object.entries(propsMeta)) defaultProps[k] = v.default;

// ---------------------------------------------------------------- encode (support.js: encode.ts)

const CAMEL_ATTR = 'sc-camel-';
const INLINE_TEXT_TAGS =
  'a abbr b bdi bdo br cite code del dfn em i ins kbd mark q s samp small span strike strong sub sup u var wbr'.split(' ');
const RAW_WRAP = {
  select: 'sc-raw-select', table: 'sc-raw-table', tbody: 'sc-raw-tbody', thead: 'sc-raw-thead',
  tfoot: 'sc-raw-tfoot', tr: 'sc-raw-tr', td: 'sc-raw-td', th: 'sc-raw-th', caption: 'sc-raw-caption',
};
const RAW_UNWRAP = Object.fromEntries(Object.entries(RAW_WRAP).map(([k, v]) => [v, k]));
const EVENT_MAP = {
  onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit',
  onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onmousedown: 'onMouseDown',
  onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave',
  onfocus: 'onFocus', onblur: 'onBlur', ondoubleclick: 'onDoubleClick', oncontextmenu: 'onContextMenu',
  onmousemove: 'onMouseMove', onmouseover: 'onMouseOver', onmouseout: 'onMouseOut',
  onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp', onpointermove: 'onPointerMove',
  onpointerenter: 'onPointerEnter', onpointerleave: 'onPointerLeave', onpointercancel: 'onPointerCancel',
  onpointerover: 'onPointerOver', onpointerout: 'onPointerOut', ongotpointercapture: 'onGotPointerCapture',
  onlostpointercapture: 'onLostPointerCapture', ontouchstart: 'onTouchStart', ontouchend: 'onTouchEnd',
  ontouchmove: 'onTouchMove', ontouchcancel: 'onTouchCancel', ondragstart: 'onDragStart',
  ondragend: 'onDragEnd', ondragenter: 'onDragEnter', ondragleave: 'onDragLeave', ondragover: 'onDragOver',
  onanimationstart: 'onAnimationStart', onanimationend: 'onAnimationEnd',
  onanimationiteration: 'onAnimationIteration', ontransitionend: 'onTransitionEnd',
};

// The HTML parser lowercases attribute names, so camelCase ones (onClick) are stashed behind a
// kebab-cased prefix before parsing and restored after.
function encodeCase(html) {
  html = html.replace(/<helmet(\s|>)/gi, '<sc-helmet$1').replace(/<\/helmet\s*>/gi, '</sc-helmet>');
  html = html.replace(/(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g,
    (_, sp, name, eq) => sp + CAMEL_ATTR + name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + eq);
  for (const [real, alias] of Object.entries(RAW_WRAP)) {
    html = html.replace(new RegExp('(</?)' + real + '(?=[\\s>])', 'gi'), '$1' + alias);
  }
  return html;
}

const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// ---------------------------------------------------------------- expressions (support.js: expr.ts)

// The runtime resolver walks a dotted/bracketed path and yields undefined the moment a link is
// missing, which is optional chaining. It also handles !x, ==/=== comparisons and literals. Every
// construct it supports is compiled here; anything else aborts the build rather than miscompiling.
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER = /^-?\d+(\.\d+)?$/;

function parensWrapWhole(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') { depth--; if (depth === 0) return false; }
  }
  return true;
}

function findTopLevelEquality(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (depth === 0 && (c === '=' || c === '!') && expr[i + 1] === '=') {
      if (i > 0 && (expr[i - 1] === '=' || expr[i - 1] === '!')) continue;
      if (!expr.slice(0, i).trim()) continue;
      return { index: i, op: expr[i + 2] === '=' ? c + '==' : c + '=' };
    }
  }
  return null;
}

function compileExpr(raw, scope) {
  const expr = String(raw).trim();
  if (!expr) return 'undefined';
  if (expr[0] === '(' && expr[expr.length - 1] === ')' && parensWrapWhole(expr)) {
    return '(' + compileExpr(expr.slice(1, -1), scope) + ')';
  }
  const eq = findTopLevelEquality(expr);
  if (eq) {
    const l = compileExpr(expr.slice(0, eq.index), scope);
    const r = compileExpr(expr.slice(eq.index + eq.op.length), scope);
    return '(' + l + ' ' + eq.op + ' ' + r + ')';
  }
  if (expr[0] === '!') return '!' + compileExpr(expr.slice(1), scope);
  if (expr === 'true' || expr === 'false' || expr === 'null' || expr === 'undefined') return expr;
  if (NUMBER.test(expr)) return expr;
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) {
    return JSON.stringify(expr.slice(1, -1));
  }
  return compilePath(expr, scope);
}

function compilePath(expr, scope) {
  const head = expr.match(IDENT);
  if (!head) throw new Error('cannot compile expression: ' + JSON.stringify(expr));
  let out = scope + '.' + head[0];
  let i = head[0].length;
  while (i < expr.length) {
    if (expr[i] === '.') {
      const m = expr.slice(i + 1).match(IDENT) || expr.slice(i + 1).match(/^\d+/);
      if (!m) throw new Error('cannot compile path: ' + JSON.stringify(expr));
      out += '?.' + m[0];
      i += 1 + m[0].length;
    } else if (expr[i] === '[') {
      let depth = 1, j = i + 1;
      while (j < expr.length && depth > 0) {
        if (expr[j] === '[') depth++;
        else if (expr[j] === ']') { depth--; if (depth === 0) break; }
        j++;
      }
      if (depth !== 0) throw new Error('unbalanced [ in: ' + JSON.stringify(expr));
      out += '?.[' + compileExpr(expr.slice(i + 1, j), scope) + ']';
      i = j + 1;
    } else {
      throw new Error('cannot compile path: ' + JSON.stringify(expr));
    }
  }
  return out;
}

// An attribute is either one whole {{ }} (value passes through with its real type: a ref object, a
// handler, a boolean) or a string with holes spliced in. (support.js: compileAttr)
function compileAttrValue(raw, scope) {
  const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (whole) return { dynamic: true, whole: true, code: compileExpr(whole[1], scope) };
  if (!raw.includes('{{')) return { dynamic: false, whole: false, code: JSON.stringify(raw), literal: raw };
  const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
  const pieces = parts.map((s, i) => (i & 1) ? '${' + compileExpr(s, scope) + ' ?? ""}' : s.replace(/[\\`$]/g, (c) => '\\' + c));
  return { dynamic: true, whole: false, code: '`' + pieces.join('') + '`' };
}

// ---------------------------------------------------------------- css (support.js: compile.ts)

function cssToObj(css) {
  const o = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith('--') ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  return o;
}

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

// An inline style beats a class selector, so every :hover declaration is forced through.
function importantify(css) {
  css = stripComments(css);
  const decls = [];
  let start = 0, depth = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { decls.push(css.slice(start, i)); start = i + 1; }
  }
  decls.push(css.slice(start));
  return decls.map((d) => d.trim()).filter(Boolean)
    .map((d) => /!\s*important$/i.test(d) ? d : d + ' !important').join(';');
}

// style-hover / style-before / style-after become real rules in a generated sheet, named in the
// order the walk meets them, deduped by (pseudo, css) exactly as the runtime's sheet does.
const pseudoRules = [];
const pseudoCache = new Map();
function pseudoClass(pseudo, css) {
  const k = pseudo + '|' + css;
  if (pseudoCache.has(k)) return pseudoCache.get(k);
  const cls = 'scp' + pseudoRules.length.toString(36);
  const isElement = pseudo === 'before' || pseudo === 'after';
  const sel = isElement ? '.' + cls + '::' + pseudo : '.' + cls + ':' + pseudo;
  pseudoRules.push(sel + '{' + (isElement ? css : importantify(css)) + '}');
  pseudoCache.set(k, cls);
  return cls;
}

// ---------------------------------------------------------------- parse

const dom = new JSDOM('<!doctype html><body></body>');
const { document, Node } = dom.window;
const tpl = document.createElement('template');
tpl.innerHTML = encodeCase(templateSrc);

// The runtime forces a remount when two different template elements land at the same index, by
// folding a hash of the subtree's shape into the React key. Only elements whose whole subtree is
// inline text get one. (support.js: contentKey / NEVER_CONTENT_KEYED / NOT_INLINE_SELECTOR)
const NEVER_CONTENT_KEYED = new Set('script style textarea option title select canvas iframe video audio'.split(' '));
const NOT_INLINE_SELECTOR = ':not(' + INLINE_TEXT_TAGS.join(',') + ')';

function contentKey(el) {
  const clone = el.cloneNode(true);
  for (const d of clone.querySelectorAll('*')) {
    while (d.attributes.length) d.removeAttribute(d.attributes[0].name);
  }
  const s = clone.innerHTML;
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  return s.length + '.' + (hash >>> 0).toString(36);
}

// ---------------------------------------------------------------- emit

let helmetHtml = null;
const IND = (n) => '\n' + '  '.repeat(n);

function emitChildren(el, scope, depth) {
  const out = [];
  for (const node of el.childNodes) {
    const code = emitNode(node, scope, depth, out.length);
    if (code != null) out.push(code);
  }
  return out;
}

function emitNode(node, scope, depth, index) {
  if (node.nodeType === Node.TEXT_NODE) return emitText(node, scope, index);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === 'sc-helmet') { helmetHtml = node.innerHTML; return null; }
  if (tag === 'sc-for') return emitFor(node, scope, depth, index);
  if (tag === 'sc-if') return emitIf(node, scope, depth, index);
  return emitElement(node, scope, depth, index);
}

// Whitespace-only text is dropped only when it holds no space at all, so a newline plus indentation
// survives as the word-space HTML would render it. (support.js: walkText)
function emitText(node, scope, index) {
  const txt = node.nodeValue ?? '';
  if (!txt.includes('{{')) {
    if (!txt.trim() && !txt.includes(' ')) return null;
    return JSON.stringify(txt);
  }
  const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
  const args = parts.map((p, i) => (i & 1) ? 'I(' + compileExpr(p, scope) + ',' + i + ')' : JSON.stringify(p));
  return 'h(F,{key:' + index + '},' + args.join(',') + ')';
}

function emitIf(el, scope, depth, index) {
  const cond = compileAttrValue(el.getAttribute('value') || '', scope);
  const kids = emitChildren(el, scope, depth + 1);
  const body = kids.length
    ? 'h(F,{key:' + index + '},' + IND(depth + 1) + kids.join(',' + IND(depth + 1)) + ')'
    : 'h(F,{key:' + index + '})';
  return '(' + cond.code + ' ? ' + body + ' : null)';
}

function emitFor(el, scope, depth, index) {
  const list = compileAttrValue(el.getAttribute('list') || '', scope);
  const as = el.getAttribute('as') || 'item';
  const inner = scope + 'i';
  const kids = emitChildren(el, inner, depth + 2);
  return 'h(F,{key:' + index + '},L(' + list.code + ').map(function(item,i){' +
    IND(depth + 1) + 'var ' + inner + ' = Object.assign({}, ' + scope + ', {' + JSON.stringify(as) + ': item, $index: i});' +
    IND(depth + 1) + 'return h(F,{key:i},' + IND(depth + 2) + kids.join(',' + IND(depth + 2)) + ');' +
    IND(depth) + '}))';
}

function emitElement(el, scope, depth, index) {
  const tag = RAW_UNWRAP[el.localName] || el.localName;
  const inlineOnly = el.childNodes.length > 0 && !NEVER_CONTENT_KEYED.has(tag) &&
    el.querySelector(NOT_INLINE_SELECTOR) === null;
  const defaultKey = JSON.stringify(inlineOnly ? index + '|' + contentKey(el) : String(index));

  // React writes attributes in prop order, so props are assembled in the runtime's order: key
  // first, then each attribute where it stood in the source, and className folded in at the
  // position the class attribute held (or appended, when style-* is the only source of classes).
  const props = [{ name: 'key', code: defaultKey }];
  const classes = [];
  let classSlot = null;

  for (const attr of [...el.attributes]) {
    let name = attr.name;
    if (name === 'sc-name' || name === 'data-dc-tpl') continue;
    if (name.startsWith(CAMEL_ATTR)) name = kebabToCamel(name.slice(CAMEL_ATTR.length));
    if (name === 'hint-size' || name === 'hint-placeholder-count' || name === 'hint-placeholder-val') continue;
    if (name.startsWith('style-')) { classes.push(pseudoClass(name.slice(6), attr.value)); continue; }

    if (name === 'class') name = 'className';
    else if (name === 'for') name = 'htmlFor';
    else if (name.startsWith('on')) name = EVENT_MAP[name] || 'on' + name[2].toUpperCase() + name.slice(3);

    const v = compileAttrValue(attr.value, scope);
    if (name === 'key') { props[0].code = v.code; continue; }
    if (name === 'style') {
      // A static style is turned into its React object here; a style carrying holes keeps the
      // runtime's parse so a value containing a ";" splits the same way it does today.
      props.push({ name: 'style', code: v.dynamic ? 'S(' + v.code + ')' : JSON.stringify(cssToObj(v.literal)) });
      continue;
    }
    const slot = { name, code: v.code };
    props.push(slot);
    if (name === 'className') classSlot = slot;
  }

  if (classes.length) {
    const lit = JSON.stringify(classes.join(' '));
    if (classSlot) classSlot.code = 'C(' + classSlot.code + ',' + lit + ')';
    else props.push({ name: 'className', code: lit });
  }

  const kids = emitChildren(el, scope, depth + 1);
  const pairs = props.map((p) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.name) ? p.name : JSON.stringify(p.name)) + ': ' + p.code);
  const head = 'h(' + JSON.stringify(tag) + ', { ' + pairs.join(', ') + ' }';
  if (!kids.length) return head + ')';
  return head + ',' + IND(depth + 1) + kids.join(',' + IND(depth + 1)) + IND(depth) + ')';
}

const rootChildren = emitChildren(tpl.content, 'V', 3);
if (helmetHtml == null) throw new Error('no <helmet> block found');

// ---------------------------------------------------------------- write app.js

const RUNTIME = `
  var React = window.React, ReactDOM = window.ReactDOM;
  var h = React.createElement, F = React.Fragment;

  // css string to React style object (support.js: cssToObj)
  function S(css) {
    if (css == null) return undefined;
    if (typeof css === 'object') return css;
    var o = {};
    String(css).split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var p = decl.slice(0, i).trim();
      o[p.indexOf('--') === 0 ? p : p.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = decl.slice(i + 1).trim();
    });
    return o;
  }

  function C(a, b) { return [a, b].filter(Boolean).join(' '); }
  function L(v) { return Array.isArray(v) ? v : []; }

  // an interpolated hole (support.js: walkText). Values keep the runtime's shape: elements and
  // arrays pass through, null and booleans render nothing, everything else becomes a span.
  var warned = {};
  function I(v, k) {
    if (v === undefined) {
      if (!warned[k]) { warned[k] = 1; console.warn('[app] unresolved binding rendered as empty'); }
      return null;
    }
    if (React.isValidElement(v) || Array.isArray(v)) return h(F, { key: k }, v);
    if (v === null || typeof v === 'boolean') return null;
    return h('span', { key: k, className: 'sc-interp' }, String(v));
  }

  // the base class the design's logic extends (support.js: StreamableLogic)
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; this.__host = null; }
    setState(update, cb) { if (this.__host) this.__host.__setLogicState(update, cb); }
    forceUpdate() { if (this.__host) this.__host.forceUpdate(); }
    componentDidMount() {}
    componentDidUpdate(_prev) {}
    componentWillUnmount() {}
    renderVals() { return {}; }
  }
`;

const HOST = `
  // The wrapper the runtime put around the template: owns the logic instance, forwards lifecycle,
  // and renders the template against { ...props, ...renderVals() }. (support.js: StreamableComponent)
  var DEFAULT_PROPS = ${JSON.stringify(defaultProps)};

  class Host extends React.Component {
    constructor(props) {
      super(props);
      this.state = { v: 0 };
      this.logic = new Component(DEFAULT_PROPS);
      this.logic.__host = this;
    }
    __setLogicState(update, cb) {
      var prev = this.logic.state;
      var patch = typeof update === 'function' ? update(prev) : update;
      this.logic.state = Object.assign({}, prev, patch);
      this.setState(function (s) { return { v: s.v + 1 }; }, cb);
    }
    componentDidMount() { this.logic.componentDidMount(); }
    componentDidUpdate(prev) { this.logic.componentDidUpdate(prev); }
    componentWillUnmount() { this.logic.componentWillUnmount(); }
    render() {
      var V = Object.assign({}, DEFAULT_PROPS, this.logic.renderVals() || {});
      return h('div', { className: 'sc-host', 'data-sc-name': 'Root' }, tpl(V));
    }
  }

  ReactDOM.createRoot(document.getElementById('dc-root')).render(h(Host));
`;

const appJs = `// GENERATED by tools/build-dc.mjs from ${SRC}. Do not edit; edit the design source and rebuild.
(function () {
'use strict';
${RUNTIME}
  // ---- template ----------------------------------------------------------
  function tpl(V) {
    return [
      ${rootChildren.join(',\n      ')}
    ];
  }

  // ---- logic (verbatim from ${SRC}) ---------------------------------------
${logicSrc.replace(/\r\n?/g, '\n').replace(/^/gm, '  ').replace(/\s+$/, '')}
${HOST}
})();
`;

writeFileSync(OUT_JS, appJs);

// ---------------------------------------------------------------- write index.html

// support.js: FULL_PAGE_CSS, appended at boot after the template is swapped for #dc-root
const FULL_PAGE_CSS = 'html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}';

const helmet = helmetHtml.replace(/^\n/, '').replace(/\s+$/, '');
const indexHtml = `<!DOCTYPE html>
<!-- GENERATED by tools/build-dc.mjs from ${SRC}. Do not edit; edit the design source and rebuild. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yiliang Shao</title>
<style>${FULL_PAGE_CSS}</style>
${helmet}
<style>
${pseudoRules.join('\n')}
</style>
</head>
<body>
<div id="dc-root"></div>
<script src="./vendor/react.production.min.js"></script>
<script src="./vendor/react-dom.production.min.js"></script>
<script src="./app.js"></script>
</body>
</html>
`;

writeFileSync(OUT_HTML, indexHtml);

console.log('wrote ' + OUT_JS + ' (' + appJs.length + ' bytes) and ' + OUT_HTML +
  ' (' + indexHtml.length + ' bytes); ' + pseudoRules.length + ' pseudo rules');
