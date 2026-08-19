#!/usr/bin/env node
/**
 * inject-act2.js — splices Acts 2 AND 3 into learn/tax-explorer/index.html.
 *
 * Phase 3 kept the filename rather than forking a second injector: two scripts
 * both rewriting the same page would have to agree on ordering to stay
 * idempotent, and that agreement is exactly the kind of thing that quietly
 * stops holding.
 *
 * Why a script rather than a hand edit: the engine (model.js) and its payload
 * (act2-data.json) are the SAME text the headless tests exercise. Injecting them
 * mechanically is what guarantees the page and the tests can never drift apart.
 * Re-running is idempotent — every injected region is bounded by ACT2 markers and
 * is stripped before being re-inserted.
 *
 * Usage: node inject-act2.js [--page <index.html>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
function arg(f, d) { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; }
const PAGE = arg('--page', path.join(HERE, '..', '..', 'learn', 'tax-explorer', 'index.html'));

const read = f => fs.readFileSync(f, 'utf8');
let html = read(PAGE);
const ORIGINALS = {
  lede: 'This page is Act 1 of a three-part tool: a scrubbable history of federal tax policy from 1913 to today, built entirely from primary sources — every figure below traces to a government agency, a peer-reviewed paper, or a named research shop, dated and linked.',
  flag: '<strong>This page is a work in progress.</strong> It currently covers Act 1 — the history. A policy sandbox (Act 2) and a scenario library (Act 3) are planned as later updates. Nothing here routes to crisis services; if you need help today, use <a href="/find.html">Find resources</a> or the crisis bar above.',
  coming: '<li><strong>Act 2 — the sandbox.</strong> Move the sliders yourself: change the top rate, close a loophole, swap in a flat tax, and see a cited, range-based estimate of what happens to revenue, to each income group, and to growth — with the mechanism explained in plain language every time.</li>\n      ',
  coming3: '<li><strong>Act 3 — twelve scenario cards.</strong> One-tap presets, from "close the big loopholes" to "bring back the 2021 Child Tax Credit," each scored, sourced, and paired with what critics say.</li>\n      '
};

function strip(name, s) {
  // Also swallow the blank lines the wrapper inserts, so a re-run is byte-identical.
  // Two marker syntaxes: HTML comments in markup, CSS comments inside <style>
  // (an HTML comment inside a stylesheet is a CSS parse error that eats the rule
  // after it — which is exactly the bug this comment exists to stop recurring).
  const html = new RegExp('\\n*[ \\t]*<!-- ACT2:BEGIN ' + name + ' -->[\\s\\S]*?<!-- ACT2:END ' + name + ' -->\\n*', 'g');
  const css = new RegExp('\\n*[ \\t]*/\\* ACT2:BEGIN ' + name + ' \\*/[\\s\\S]*?/\\* ACT2:END ' + name + ' \\*/\\n*', 'g');
  return s.replace(html, '\n').replace(css, '\n');
}
function wrapCss(name, body) {
  return '/* ACT2:BEGIN ' + name + ' */\n' + body + '\n/* ACT2:END ' + name + ' */';
}
function wrap(name, body, comment) {
  return '<!-- ACT2:BEGIN ' + name + ' -->' + (comment ? '\n' + comment : '') + '\n' + body + '\n<!-- ACT2:END ' + name + ' -->';
}
['css', 'nav', 'section', 'scripts', 'css3', 'nav3', 'section3', 'scripts3'].forEach(n => { html = strip(n, html); });
// undo previous copy rewrites so the script is idempotent
html = html.replace(/<!-- ACT2:COPY:BEGIN (\w+) -->([\s\S]*?)<!-- ACT2:COPY:END \1 -->/g, (m, k, inner) => ORIGINALS[k] !== undefined ? ORIGINALS[k] : inner);

/* 1 ── CSS ─────────────────────────────────────────────────────────────── */
const css = squeezeCss(read(path.join(HERE, 'ui', 'act2.css')).trim());
// NB: a string replacement would interpret $&, $' and $` inside the injected file
// content. Every insertion below therefore uses a function replacement.
const css3 = squeezeCss(read(path.join(HERE, 'ui', 'act3.css')).trim());
html = html.replace(/\n<\/style>/, () => '\n\n' + wrapCss('css', css) + '\n\n' + wrapCss('css3', css3) + '\n</style>');

/* 2 ── on-page nav ─────────────────────────────────────────────────────── */
const navItems = [
  '      <li><a href="#sandbox">Act 2 — you hold the pen (the sandbox)</a></li>',
  '      <li><a href="#notes-act2">Six caveats to the sandbox</a></li>'
].join('\n');
const navItems3 = [
  '      <li><a href="#scenarios">Act 3 — what people propose (the scenario library)</a></li>',
  '      <li><a href="#notes-act3">One more thing a scenario card can’t tell you</a></li>'
].join('\n');
html = html.replace(/(\n      <li><a href="#states">[^<]*<\/a><\/li>)/, (m) => m + '\n' + wrap('nav', navItems) + '\n' + wrap('nav3', navItems3));

/* 3 ── the Act 2 section, inserted before "Coming next" ────────────────── */
const section = read(path.join(HERE, 'ui', 'act2-section.html.part')).replace(/\s+$/, '');
const section3 = read(path.join(HERE, 'ui', 'act3-section.html.part')).replace(/\s+$/, '');
html = html.replace(/\n(  <div class="related">)/, (m, g1) =>
  '\n\n' + wrap('section', section) + '\n\n' + wrap('section3', section3) + '\n\n' + g1);

/* 4 ── copy rewrites: the page is no longer "Act 1 only" ───────────────── */
function rewrite(key, from, to) {
  if (html.indexOf(from) === -1) {
    console.warn('  ! copy anchor not found (' + key + ') — leaving page copy as-is');
    return;
  }
  // ORIGINALS above is the restore table for idempotent re-runs.
  html = html.replace(from, () => '<!-- ACT2:COPY:BEGIN ' + key + ' -->' + to + '<!-- ACT2:COPY:END ' + key + ' -->');
}
rewrite('lede',
  'This page is Act 1 of a three-part tool: a scrubbable history of federal tax policy from 1913 to today, built entirely from primary sources — every figure below traces to a government agency, a peer-reviewed paper, or a named research shop, dated and linked.',
  'This page is a three-part tool. Act 1 is a scrubbable history of federal tax policy from 1913 to today. Act 2 hands you the controls: change the rates, close the loopholes, swap the system out, and see what happens to revenue, to each income group, and to growth — with the mechanism explained in plain language every time. Act 3 is twelve things people actually propose, each one a tap away from the same controls. Every figure traces to a government agency, a peer-reviewed paper, or a named research shop, dated and linked.');
rewrite('flag',
  '<strong>This page is a work in progress.</strong> It currently covers Act 1 — the history. A policy sandbox (Act 2) and a scenario library (Act 3) are planned as later updates. Nothing here routes to crisis services; if you need help today, use <a href="/find.html">Find resources</a> or the crisis bar above.',
  '<strong>All three acts are here.</strong> The history, the sandbox, and the scenario library, with a <a href="/learn/tax-explorer/methodology.html">full methodology page</a> setting out every parameter, every derivation and every source quote behind them. Nothing here routes to crisis services; if you need help today, use <a href="/find.html">Find resources</a> or the crisis bar above.');
rewrite('coming',
  '<li><strong>Act 2 — the sandbox.</strong> Move the sliders yourself: change the top rate, close a loophole, swap in a flat tax, and see a cited, range-based estimate of what happens to revenue, to each income group, and to growth — with the mechanism explained in plain language every time.</li>\n      ',
  '');
rewrite('coming3',
  '<li><strong>Act 3 — twelve scenario cards.</strong> One-tap presets, from "close the big loopholes" to "bring back the 2021 Child Tax Credit," each scored, sourced, and paired with what critics say.</li>\n      ',
  '');

/* 4b ── squeeze: comment/indentation strip for injected JS and CSS ─────── */
// A conservative whitespace/comment stripper, not a general minifier. It is
// template-literal-aware (leading indentation inside a `...` string is
// meaningful and kept; everywhere else it is not). The engine's squeezed copy
// is proven behaviourally identical to the on-disk source before injection —
// see the equivalence check below — and the on-disk sources stay readable.
function squeeze(src) {
  var out = [], i = 0, n = src.length;
  var mode = 'code';            // code | sq | dq | tpl | line | block
  var stack = [];               // brace counters for ${ ... } nesting
  var atLineStart = true;
  var slashOnLine = false;
  while (i < n) {
    var c = src[i], d = i + 1 < n ? src[i + 1] : '';
    if (mode === 'code') {
      if (atLineStart && (c === ' ' || c === '\t')) { i++; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      // '//' mid-line can be a regex body (e.g. /\//g), which a scanner without
      // a regex grammar cannot tell from a comment — so an inline comment is only
      // stripped when no other '/' has appeared in code since the line began.
      // Every squeezed file is parse-checked afterwards, so a miss aborts the build.
      if (c === '/' && d === '/' && (atLineStart || !slashOnLine)) { mode = 'line'; i += 2; continue; }
      if (c === '/') slashOnLine = true;
      if (c === '\n') slashOnLine = false;
      atLineStart = (c === '\n');
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      else if (c === '{' && stack.length) stack[stack.length - 1]++;
      else if (c === '}' && stack.length) {
        if (stack[stack.length - 1] === 0) { stack.pop(); mode = 'tpl'; }
        else stack[stack.length - 1]--;
      }
      out.push(c); i++; continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      out.push(c);
      if (c === '\\') { out.push(d); i += 2; continue; }
      if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')) mode = 'code';
      i++; continue;
    }
    if (mode === 'tpl') {
      out.push(c);
      if (c === '\\') { out.push(d); i += 2; continue; }
      if (c === '`') { mode = 'code'; i++; atLineStart = false; continue; }
      if (c === '$' && d === '{') { out.push(d); i += 2; stack.push(0); mode = 'code'; atLineStart = false; continue; }
      i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; continue; } i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; } i++; continue; }
  }
  return out.join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+/, '');
}
function squeezeCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n').trim();
}
// Equivalence check: the squeezed engine must produce byte-identical results
// to the on-disk engine across a canonical grid of lever/assumption states.
function checkEngineEquivalence(squeezedEngine) {
  var ref = require('./model.js');
  var mod = { exports: {} };
  new Function('module', 'require', 'self', squeezedEngine)(
    mod, function () { return require('./act2-data.json'); }, undefined);
  var sq = mod.exports;
  var L = JSON.parse(JSON.stringify(ref.CURRENT_LAW));
  var A = JSON.parse(JSON.stringify(ref.DEFAULT_ASSUMPTIONS));
  var states = [
    [{}, {}],
    [{ topRate: 70, topRateThreshold: '10m' }, {}],
    [{ cgTopRate: 39.6 }, {}],
    [{ cgTopRate: 39.6, stepUp: 'atDeath' }, {}],
    [{ system: 'flat', flatRate: 17 }, {}],
    [{ lpS199a: true, lpCarried: true, irsFunding: 'restore' }, { eti: 0.12 }],
    [{ topRate: 32 }, { lens: 'taxfoundation', regime: 'recession' }],
    [{ payrollCap: 'eliminate' }, { corpLaborShare: 0.5 }],
    [{ system: 'fairtax' }, { eti: 0.57 }],
    [{ corpRate: 28 }, { lens: 'cbo' }]
  ];
  states.forEach(function (st) {
    var lv = Object.assign(JSON.parse(JSON.stringify(L)), st[0]);
    var as = Object.assign(JSON.parse(JSON.stringify(A)), st[1]);
    var a, b, ea, eb;
    try { a = JSON.stringify(ref.model(lv, as)); } catch (e) { ea = String(e); }
    try { b = JSON.stringify(sq.model(lv, as)); } catch (e) { eb = String(e); }
    if (ea !== eb || a !== b) {
      console.error('SQUEEZE EQUIVALENCE FAILED for state ' + JSON.stringify(st));
      process.exit(1);
    }
  });
}

/* 5 ── data + engine + UI, inline, before </body> ──────────────────────── */
const data = read(path.join(HERE, 'act2-data.json')).trim();
const vm = require('vm');
function squeezeJs(label, src) {
  const out = squeeze(src);
  try { new vm.Script(out); } catch (e) {
    console.error('SQUEEZE BROKE ' + label + ': ' + e.message); process.exit(1);
  }
  return out;
}
const engine = squeezeJs('model.js', read(path.join(HERE, 'model.js')).replace(/\s+$/, ''));
checkEngineEquivalence(engine);
const ui = squeezeJs('act2-ui.js', read(path.join(HERE, 'ui', 'act2-ui.js')).replace(/\s+$/, ''));
const cardsMod = squeezeJs('act3-cards.js', read(path.join(HERE, 'act3-cards.js')).replace(/\s+$/, ''));
const ui3 = squeezeJs('act3-ui.js', read(path.join(HERE, 'ui', 'act3-ui.js')).replace(/\s+$/, ''));
const scripts =
  '<script type="application/json" id="act2-data">' + data + '</script>\n' +
  '<script>\n' + engine + '\n</script>\n' +
  '<script>\n' + cardsMod + '\n</script>\n' +
  '<script>\n' + ui + '\n</script>\n' +
  '<script>\n' + ui3 + '\n</script>';
html = html.replace(/\n<\/body>/, () => '\n\n' + wrap('scripts',
  scripts,
  '<!-- act2-data.json + model.js + act3-cards.js + act2-ui.js + act3-ui.js, injected by scripts/tax-explorer/inject-act2.js with comments and\n     indentation stripped (the readable sources live in scripts/tax-explorer/, and the squeezed engine is\n     verified behaviourally identical before injection). Edit those files and re-run the script; do not hand-edit the copies below. -->') + '\n\n</body>');

html = html.replace(/\n{3,}/g, '\n\n');   // keep re-runs byte-identical
fs.writeFileSync(PAGE, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('index.html written: ' + kb + ' KB');
const k = b => (Buffer.byteLength(b) / 1024).toFixed(1);
console.log('  Act 2 — data ' + k(data) + ' KB · engine ' + k(engine) + ' KB · ui ' + k(ui) +
  ' KB · css ' + k(css) + ' KB · section ' + k(section) + ' KB');
console.log('  Act 3 — cards ' + k(cardsMod) + ' KB · ui ' + k(ui3) + ' KB · css ' + k(css3) +
  ' KB · section ' + k(section3) + ' KB');
if (kb > 450) { console.error('OVER THE 450 KB HARD CAP'); process.exit(1); }
