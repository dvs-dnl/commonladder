#!/usr/bin/env node
/**
 * build-methodology.js — generates learn/tax-explorer/methodology.html.
 *
 * The page is a Learn Evidence Article (page type 6) and it is GENERATED for the
 * same reason index.html is: its whole purpose is to reproduce, exactly, what is
 * in learn/tax-explorer/data/. A hand-written provenance table is a copy that
 * starts drifting the moment a datum is corrected.
 *
 * Prose lives in ui/methodology-body.html.part. Everything below the prose — the
 * parameter tables, the score tables, the card figures, the blocked list — is
 * read out of the data files at build time, quotes and all.
 *
 * Run from the repo root (github/commonladder-theme/):
 *   node scripts/tax-explorer/build-methodology.js
 *
 * NOT SHIPPED. Only the generated methodology.html goes to the site.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const DATA = path.join(HERE, '..', '..', 'learn', 'tax-explorer', 'data');
const OUT = path.join(HERE, '..', '..', 'learn', 'tax-explorer', 'methodology.html');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const par = read('parameters.json');
const exp = read('expenditures.json');
const scen = read('scenarios.json');
const arrs = read('series-arrays.json');
const base = read('baseline-fy2025.json');
const blocked = read('blocked.json');
const notes = read('act1-notes.json');
const prov = JSON.parse(fs.readFileSync(path.join(HERE, 'act3-provenance.json'), 'utf8'));

const REVIEWED = '2026-08-18';
const REVIEWED_HUMAN = '18 August 2026';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── walk any data file and pull out every leaf that is a datum ─────────── */
// A datum is an object carrying a value and/or a verbatim quote. This is the same
// shape the data/README.md schema describes, so the walk finds all of them
// without a hand-maintained list that could fall behind the files.
function collect(root, prefix) {
  const out = [];
  (function walk(o, p) {
    if (o === null || typeof o !== 'object') return;
    if (!Array.isArray(o) && (Object.prototype.hasOwnProperty.call(o, 'value') || o.quote || o.quotes)) {
      out.push({ path: p, d: o });
      // keep walking: some data carry nested sub-datums under a parent that also
      // has a value of its own.
    }
    Object.keys(o).forEach(k => {
      if (['quote', 'quotes', 'note', 'quote_2', 'quote2', 'quote3'].indexOf(k) > -1) return;
      walk(o[k], p ? p + '.' + k : k);
    });
  }(root, prefix || ''));
  return out;
}
function quoteOf(d) {
  if (typeof d.quote === 'string') return d.quote;
  if (Array.isArray(d.quotes)) return d.quotes.join(' … ');
  if (typeof d.corroborating_quote === 'string') return d.corroborating_quote;
  return '';
}
function valueOf(d) {
  if (d.value === undefined) return '';
  if (d.value === null) return '<span class="meth-null">not shipped</span>';
  if (Array.isArray(d.value)) return esc(d.value.join(' to '));
  return esc(String(d.value)) + (d.unit ? ' <span class="meth-unit">' + esc(d.unit) + '</span>' : '');
}
function row(label, d, extra) {
  const q = quoteOf(d);
  return '<tr>' +
    '<td><span class="meth-path">' + esc(label) + '</span>' +
      (d.status ? '<br><span class="meth-status meth-status--' + esc(d.status) + '">' + esc(d.status) + '</span>' : '') + '</td>' +
    '<td class="meth-val">' + valueOf(d) + '</td>' +
    '<td>' + esc(d.period || d.window || d.coverage || (extra && extra.period) || '—') +
      (d.baseline ? '<br><span class="meth-unit">baseline: ' + esc(d.baseline) + '</span>' : '') + '</td>' +
    '<td>' + (d.url ? '<a href="' + esc(d.url) + '" rel="noreferrer">' + esc(d.source || d.shop || 'source') + '</a>' : esc(d.source || d.shop || '—')) +
      (d.tier ? ' <span class="meth-unit">(' + esc(d.tier) + ')</span>' : '') +
      (q ? '<blockquote class="meth-q">' + esc(q) + '</blockquote>' : '<span class="meth-noq">no verbatim line stored</span>') +
    '</td></tr>';
}
function table(rows, caption) {
  return '<div class="meth-tablewrap"><table class="meth-table">' +
    '<caption>' + esc(caption) + '</caption>' +
    '<thead><tr><th scope="col">Datum</th><th scope="col">Value</th><th scope="col">Period</th><th scope="col">Source and the line it was read from</th></tr></thead>' +
    '<tbody>' + rows.join('\n') + '</tbody></table></div>';
}

/* ── 1. behavioural parameters ─────────────────────────────────────────── */
const paramRows = collect(par).filter(x => x.path && quoteOf(x.d) || (x.d.value !== undefined && x.d.source))
  .map(x => row(x.path, x.d));

/* ── 2. pre-scored reforms ─────────────────────────────────────────────── */
const scoreRows = []
  .concat(collect(exp.conv_scores, 'expenditures.conv_scores').map(x => row(x.path, x.d)))
  .concat(collect(exp.enforcement, 'expenditures.enforcement').map(x => row(x.path, x.d)))
  .concat(collect(exp.tax_gap, 'expenditures.tax_gap').map(x => row(x.path, x.d)))
  .concat(collect(exp.avoidance_mechanics, 'expenditures.avoidance_mechanics').map(x => row(x.path, x.d)))
  .concat(collect(exp.static_expenditures, 'expenditures.static_expenditures').map(x => row(x.path, x.d)));

/* ── 3. scenario-card figures, with the quotes the tool strips ──────────── */
const cardRows = [];
Object.keys(prov.cards).forEach(id => {
  cardRows.push('<tr class="meth-cardhead"><th colspan="4" scope="colgroup">' + esc(scen[id] && scen[id].card ? scen[id].card : id) +
    ' <span class="meth-unit">· evidence: ' + esc(prov.cards[id].evidence) + '</span></th></tr>');
  prov.cards[id].figures.forEach(f => {
    cardRows.push('<tr>' +
      '<td>' + esc(f.label) + '<br><span class="meth-path">' + esc((f.file || 'scenarios') + '.json → ' + f.path) + '</span></td>' +
      '<td class="meth-val">' + esc(String(f.value)) + (f.unit ? ' <span class="meth-unit">' + esc(f.unit) + '</span>' : '') + '</td>' +
      '<td>' + esc(f.period) + (f.baseline ? '<br><span class="meth-unit">baseline: ' + esc(f.baseline) + '</span>' : '') + '</td>' +
      '<td>' + (f.url ? '<a href="' + esc(f.url) + '" rel="noreferrer">' + esc(f.scorer || 'source') + '</a>' : esc(f.scorer || '—')) +
        (f.quote ? '<blockquote class="meth-q">' + esc(f.quote) + '</blockquote>' : '<span class="meth-noq">no verbatim line stored</span>') +
      '</td></tr>');
  });
});

/* ── 3b. the Act 1 causal-honesty notes closed in Phase 3 ───────────────── */
const noteRows = collect(notes, 'act1-notes').map(x => row(x.path, x.d));

/* ── 4. what could not be retrieved ────────────────────────────────────── */
const openBlockers = blocked.blocking.filter(b => !/CLOSED/i.test(b.severity || ''));
const closedBlockers = blocked.blocking.filter(b => /CLOSED/i.test(b.severity || ''));
const mustNotShip = blocked.non_blocking_must_not_ship || [];
const blockedHtml =
  '<p>' + esc(mustNotShip.length) + ' claims from the project’s own research notes could not be traced to a source and are therefore not displayed anywhere in the tool. ' +
  esc(openBlockers.length) + ' of the ' + esc(blocked.blocking.length) + ' items that once blocked a deliverable are still open; ' + esc(closedBlockers.length) + ' were closed when the source spreadsheets were obtained.</p>' +
  '<h3>Still open</h3><ul class="meth-blocked">' +
  openBlockers.map(b => '<li><strong>' + esc(b.id) + ' — ' + esc(b.what) + '</strong><br>' + esc(b.why_blocked || '') +
    (b.human_action ? '<br><em>What closes it:</em> ' + esc(b.human_action) : '') + '</li>').join('') +
  '</ul>' +
  '<h3>Claims that must not ship, and why</h3><ul class="meth-blocked">' +
  mustNotShip.map(b => '<li><strong>' + esc(b.claim || b.id || b.what || '') + '</strong><br>' +
    esc(b.why || b.why_blocked || b.note || b.verdict || '') + '</li>').join('') +
  '</ul>';

/* ── 5. the data files themselves ──────────────────────────────────────── */
const FILES = [
  ['baseline-fy2025.json', 'Current-law fiscal baseline: receipts by source, outlays, deficit, GDP.'],
  ['history-series.json', 'Act 1 chart series: statutory and effective rates 1913–2026, distribution, mobility, cost of living.'],
  ['series-arrays.json', 'The long-run year-by-year arrays behind the history charts.'],
  ['parameters.json', 'Behavioural dials: elasticities, multipliers, spending propensities, incidence, macro feedback.'],
  ['expenditures.json', 'Tax expenditures, repeal scores, distributional shares, avoidance mechanics, the tax gap, enforcement.'],
  ['scenarios.json', 'Act 3 scenario cards: every score, and both sides of every dispute.'],
  ['cbo-distribution.json', 'CBO’s household income and tax distribution, 1979–2022.'],
  ['soi-table-3-5.json', 'IRS Statistics of Income Table 3.5 for tax year 2023 — the static base for every computed rate change.'],
  ['soi-percentiles.json', 'IRS percentile thresholds and average rates.'],
  ['act1-notes.json', 'Sources for the Act 1 causal-honesty notes, and both sides of the California Proposition 30 counter-experiment.'],
  ['blocked.json', 'What could not be retrieved, and exactly what would close each item.']
];
const filesHtml = '<div class="meth-tablewrap"><table class="meth-table"><caption>The data directory</caption>' +
  '<thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">What is in it</th></tr></thead><tbody>' +
  FILES.map(([f, d]) => {
    let kb = '—';
    try { kb = (fs.statSync(path.join(DATA, f)).size / 1024).toFixed(1) + ' KB'; } catch (e) {}
    return '<tr><td><span class="meth-path">' + esc(f) + '</span></td><td class="meth-val">' + esc(kb) + '</td><td>' + esc(d) + '</td></tr>';
  }).join('') + '</tbody></table></div>';

/* ── the page ──────────────────────────────────────────────────────────── */
const body = fs.readFileSync(path.join(HERE, 'ui', 'methodology-body.html.part'), 'utf8').replace(/\s+$/, '');
const TITLE = 'The Tax Ladder: methodology and sources';
const DESC = 'Every parameter, derivation, and source quote behind The Tax Ladder — including the four calculations that are ours, the validation that was not completed, and the list of things the tool will not say.';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-3YXK0RL6XV"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-3YXK0RL6XV');
</script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(TITLE)} — Common Ladder</title>
  <meta name="description" content="${esc(DESC)}">
  <link rel="canonical" href="https://commonladder.org/learn/tax-explorer/methodology.html">
  <meta property="og:title" content="${esc(TITLE)} — Common Ladder">
  <meta property="og:description" content="${esc(DESC)}">
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="alternate icon" type="image/png" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Common Ladder">
  <meta property="og:url" content="https://commonladder.org/learn/tax-explorer/methodology.html">
  <meta property="og:image" content="https://commonladder.org/images/og-default.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(TITLE)} — Common Ladder">
  <meta name="twitter:description" content="${esc(DESC)}">
  <meta name="twitter:image" content="https://commonladder.org/images/og-default.png">

<style>
/* Contrast overrides, scoped to this page (Phase 4 WCAG 2.1 AA audit).
   --gray #6B7280 clears 4.5:1 on white but not on the tinted panels this page
   uses (#f4f4f2 4.39:1, #eef2f7 4.30:1); #9CA3AF fails on the page background. */
:root { --gray:#565f6d; }
.crisis-bar__sep { color:#565f6d; }
/* ===== Tax Ladder methodology — page-local (meth- prefix) ===== */
.article { max-width: 780px; }
.meth-lede { font-size:1.05rem; color:var(--dark); }
.meth-callout { border:1px solid #e3e1da; border-left:4px solid var(--blue); background:#fcfcfb; border-radius:0 var(--radius) var(--radius) 0; padding:.9rem 1rem; margin:1.4rem 0; font-size:.92rem; line-height:1.6; }
.meth-callout strong { color:var(--blue); }
.article .onpage { margin:1.6rem 0 2rem; }
.meth-never { counter-reset:none; }
.meth-never li { margin-bottom:.7rem; }
.meth-tablewrap { overflow-x:auto; margin:1.2rem 0 2rem; border:1px solid #e3e1da; border-radius:var(--radius); }
.meth-table { width:100%; border-collapse:collapse; font-size:.8rem; }
.meth-table caption { text-align:left; font-family:'Manrope',sans-serif; font-weight:700; color:var(--blue); font-size:.9rem; padding:.7rem .8rem .4rem; }
.meth-table th, .meth-table td { text-align:left; padding:.45rem .6rem; border-top:1px solid #eeece6; vertical-align:top; }
.meth-table thead th { font-family:'Manrope',sans-serif; color:var(--blue); font-weight:700; background:#fcfcfb; position:sticky; top:0; }
.meth-table td.meth-val { font-variant-numeric:tabular-nums; font-weight:700; white-space:nowrap; }
.meth-path { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.72rem; color:var(--gray); word-break:break-word; }
.meth-unit { font-size:.72rem; color:var(--gray); font-weight:400; }
.meth-q { margin:.35rem 0 0; padding:.3rem .55rem; border-left:2px solid #cfd8cd; background:#fbfbf9; font-size:.76rem; color:var(--dark); line-height:1.5; font-style:normal; }
.meth-noq { display:block; margin-top:.3rem; font-size:.74rem; color:#8a5a00; }
.meth-null { color:#8a5a00; font-weight:700; }
.meth-status { display:inline-block; font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#fff; background:var(--blue); border-radius:999px; padding:.05rem .4rem; margin-top:.2rem; }
.meth-status--blocked, .meth-status--unsourced { background:#8a5a00; }
.meth-cardhead th { background:#f4f4f2; font-family:'Manrope',sans-serif; color:var(--blue); font-size:.85rem; padding-top:.8rem; }
.meth-blocked li { margin-bottom:.8rem; font-size:.9rem; line-height:1.55; overflow-wrap:anywhere; }
code, .meth-path { overflow-wrap:anywhere; }
@media (max-width:520px){ .meth-table { font-size:.74rem; } }
</style>

</head>
<body>

<a href="#main" class="skip-link">Skip to main content</a>

<div class="crisis-bar" role="region" aria-label="Crisis help">
  <strong>Need help right now?</strong>
  <a href="tel:211">Call 211</a><span class="crisis-bar__sep">·</span>
  <a href="sms:741741?body=HOME">Text HOME to 741741</a><span class="crisis-bar__sep">·</span>
  <a href="tel:988">988 Suicide &amp; Crisis</a>
</div>

<nav class="nav" aria-label="Primary">
  <div class="nav__inner">
    <a href="/" class="nav__logo" aria-label="Common Ladder home">
      <svg width="28" height="28" viewBox="0 0 247 247" fill="none" aria-hidden="true"><g transform="translate(-12.00,-16.00)"> <path fill="#E8911A" fill-opacity="1" fill-rule="evenodd" d="M 254.00,51.00 L 234.00,85.64 L 194.00,85.64 L 174.00,51.00 L 194.00,16.36 L 234.00,16.36 Z M 231.50,51.00 L 222.75,66.16 L 205.25,66.16 L 196.50,51.00 L 205.25,35.84 L 222.75,35.84 Z"/> <path fill="#9FBCBA" fill-opacity="1" fill-rule="evenodd" d="M 148.00,118.00 L 128.00,152.64 L 88.00,152.64 L 68.00,118.00 L 88.00,83.36 L 128.00,83.36 Z M 125.50,118.00 L 116.75,133.16 L 99.25,133.16 L 90.50,118.00 L 99.25,102.84 L 116.75,102.84 Z"/> <path fill="#9FBCBA" fill-opacity="1" fill-rule="evenodd" d="M 259.00,118.00 L 239.00,152.64 L 199.00,152.64 L 179.00,118.00 L 199.00,83.36 L 239.00,83.36 Z M 236.50,118.00 L 227.75,133.16 L 210.25,133.16 L 201.50,118.00 L 210.25,102.84 L 227.75,102.84 Z"/> <path fill="#FFFFFF" fill-opacity="0.94" fill-rule="evenodd" d="M 207.00,164.00 L 187.00,198.64 L 147.00,198.64 L 127.00,164.00 L 147.00,129.36 L 187.00,129.36 Z M 184.50,164.00 L 175.75,179.16 L 158.25,179.16 L 149.50,164.00 L 158.25,148.84 L 175.75,148.84 Z"/> <path fill="#FFFFFF" fill-opacity="0.94" fill-rule="evenodd" d="M 92.00,164.00 L 72.00,198.64 L 32.00,198.64 L 12.00,164.00 L 32.00,129.36 L 72.00,129.36 Z M 69.50,164.00 L 60.75,179.16 L 43.25,179.16 L 34.50,164.00 L 43.25,148.84 L 60.75,148.84 Z"/> <path fill="#FFFFFF" fill-opacity="0.94" fill-rule="evenodd" d="M 161.00,228.00 L 141.00,262.64 L 101.00,262.64 L 81.00,228.00 L 101.00,193.36 L 141.00,193.36 Z M 138.50,228.00 L 129.75,243.16 L 112.25,243.16 L 103.50,228.00 L 112.25,212.84 L 129.75,212.84 Z"/> </g></svg>
      <span class="nav__wordmark">common<span>ladder</span></span>
    </a>
    <button class="nav__toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="primary-nav" onclick="this.setAttribute('aria-expanded', document.getElementById('primary-nav').classList.toggle('open') ? 'true' : 'false')">
      <span></span><span></span><span></span>
    </button>
    <ul class="nav__links" id="primary-nav">
      <li><a href="/providers.html">For providers</a></li>
      <li><a href="/learn/" aria-current="page">Learn</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/find.html" class="nav__cta">Find resources</a></li>
      <li><a href="/static-tools/my-ladder.html" class="nav__cta nav__cta--ladder">My Ladder</a></li>
      <li><a href="https://www.weather.gov/" rel="noreferrer" class="nav__exit" onclick="event.preventDefault();window.location.replace('https://www.weather.gov/')">Leave page</a></li>
    </ul>
  </div>
</nav>

<ol class="breadcrumb" aria-label="Breadcrumb">
  <li><a href="/">Home</a></li>
  <li><a href="/learn/">Learn</a></li>
  <li><a href="/learn/tax-explorer/">The Tax Ladder</a></li>
  <li aria-current="page">Methodology</li>
</ol>

<main id="main">
<article class="article container">

  <h1>${esc(TITLE)}</h1>

${body}

  <h2 id="params">Every behavioural parameter</h2>
  <p>These are the dials in the sandbox and the constants behind them. Where a parameter is contested, both positions are in the table and the tool ships them as a range rather than an average.</p>
${table(paramRows, 'Behavioural parameters — parameters.json')}

  <h2 id="scores">Every pre-scored reform</h2>
  <p>Where a policy has been scored by a scorekeeper, the tool uses the published figure rather than recomputing it, and prints the window and the baseline beside it. Read the baseline label before the number.</p>
${table(scoreRows, 'Tax expenditures, repeal scores and enforcement — expenditures.json')}

  <h2 id="cards">Every scenario-card figure</h2>
  <p>Each figure on a card in Act 3, with the sentence it was read from. The card itself shows the value, the period and the attribution; the quotes are here.</p>
${table(cardRows, 'Act 3 scenario cards — the figures and their source lines')}

  <h2 id="notes">The Act 1 honesty notes, and what backs them</h2>
  <p>Two of the nine causal-honesty notes attached to the history charts shipped in an earlier build carrying a visible “pending re-verification” flag, and the California Proposition 30 counter-experiment was named beside the Kansas one without figures. All three were closed on 18 August 2026 and their sources are below.</p>
${table(noteRows, 'Act 1 causal-honesty notes — act1-notes.json')}

  <h2 id="blocked">What could not be retrieved</h2>
${blockedHtml}

  <h2 id="files">The data files themselves</h2>
  <p>Every figure in the tool resolves to one of these. They are plain JSON and each datum carries its own value, unit, period, status, source, URL and verbatim quote.</p>
${filesHtml}

  <h2>Freshness</h2>
  <p>Figures are as of the fiscal years and windows shown. This page is reviewed when major tax legislation passes, not on a schedule. It carries no provider listings and is outside the weekly resource-verification cycle.</p>

  <nav class="continue" aria-label="Continue your path">
    <a href="/learn/tax-explorer/" class="continue--prev">
      <div class="continue__dir">← Back to the tool</div>
      <div class="continue__title">The Tax Ladder</div>
    </a>
  </nav>

</article>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__brand">
        <h3>Common Ladder</h3>
        <p>The civic resource platform connecting people experiencing homelessness with every service in your community.</p>
      </div>
      <div>
        <h4>Find help</h4>
        <ul>
          <li><a href="/find.html?cat=shelter">Shelter</a></li>
          <li><a href="/find.html?cat=food">Food</a></li>
          <li><a href="/find.html?cat=legal">Legal</a></li>
          <li><a href="/help/">All categories</a></li>
          <li><a href="/static-tools/">Local navigators</a></li>
          <li><a href="/coc-finder.html">Find your CoC</a></li>
        </ul>
      </div>
      <div>
        <h4>Learn</h4>
        <ul>
          <li><a href="/learn/causes/">What causes homelessness</a></li>
          <li><a href="/learn/who/">Who experiences it</a></li>
          <li><a href="/learn/solutions/">What actually works</a></li>
          <li><a href="/learn/society/">How we end it</a></li>
        </ul>
      </div>
      <div>
        <h4>About</h4>
        <ul>
          <li><a href="/about.html">Our mission</a></li>
          <li><a href="/brand/visual-guidelines.html">Brand guidelines</a></li>
          <li><a href="/contact.html">Contact</a></li>
          <li><a href="/privacy.html">Privacy</a></li>
        </ul>
      </div>
    </div>
    <div class="footer__transparency">
      <strong>Transparency:</strong> Common Ladder is an independent civic project. We do not sell user data, run ads, or accept payment from listed resources.
    </div>
    <div class="footer__bottom">
      <span>&copy; 2026 Common Ladder. Free to use, always.</span>
      <span><time datetime="${REVIEWED}">Last updated ${REVIEWED_HUMAN}</time></span>
    </div>
  </div>
</footer>

</body>
</html>
`;
fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('methodology.html written: ' + kb + ' KB');
console.log('  ' + paramRows.length + ' parameter rows · ' + scoreRows.length + ' score rows · ' + cardRows.length + ' card rows (incl. headings)');
