/* ===== Act 3 — the scenario library. Renders cards, applies presets, shares state. ===== */
(function () {
'use strict';
var M = window.TaxLadderModel, CARDS = window.TaxLadderCards, A2 = window.TaxLadderAct2;
if (!M || !CARDS || !A2) return;
var grid = document.getElementById('tx3-grid');
if (!grid) return;

var usd = M.usd;
var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
var cards = CARDS.buildCards(M.D);

/* ─────────────────────────── figure formatting ───────────────────────── */
// Units come from the data files. Nothing here converts; it only prints.
// Published figures print EXACTLY as the data file holds them. The engine's own
// currency formatter rounds for readability, which is right for a live output and
// wrong for a citation: JCT's $109.5 billion must not read as $110 billion in a
// table that names JCT beside it.
function exactUsdBn(v) {
  var a = Math.abs(v), sign = v < 0 ? '\u2212' : '';
  if (a >= 1000) return sign + '$' + String(+(a / 1000).toFixed(3)) + ' trillion';
  return sign + '$' + String(+a.toFixed(2)) + ' billion';
}
function fmt(f) {
  var v = f.value;
  switch (f.unit) {
    case 'usd_billions': return exactUsdBn(v);
    case 'usd_billions_per_year': return exactUsdBn(v) + ' a year';
    case 'usd': return '$' + Number(v).toLocaleString('en-US');
    case 'usd_2025': return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US') + ' (2025 dollars)';
    case 'percent': return v + '%';
    case 'percent_of_gdp': return v + '% of GDP';
    case 'millions_of_people': return v + ' million people';
    case 'millions_of_workers': return v + ' million workers';
    case 'millions_of_households': return v + ' million households';
    case 'billion_kroner': return v + ' billion kroner';
    case 'usd_per_metric_ton_co2e': return '$' + v + ' a tonne';
    case 'ratio': return 'more than $' + v + ' per $1';
    case 'count': return Number(v).toLocaleString('en-US');
    default: return String(v);
  }
}
// The badge is a glance; the full evidence-strength string from scenarios.json
// prints beside it, verbatim. The tool does not invent its own ratings, and it
// does not truncate the ones it was given either.
function badge(evidence) {
  var lead = String(evidence).split(/[\s,(]/)[0];
  var same = String(evidence).trim().toLowerCase() === lead.toLowerCase();
  return '<span class="tx3-badge">' + esc(lead) + '</span>' +
    (same ? '' : '<span class="tx3-badge-note">Evidence: ' + esc(evidence) + '</span>');
}

/* ───────────────────────────── card rendering ────────────────────────── */
function figuresTable(c) {
  var h = '<div class="tx3-figs-wrap"><table class="tx3-figs"><caption class="tx-sr">Published figures for ' + esc(c.title) + '</caption><thead><tr>' +
    '<th scope="col">What</th><th scope="col">Figure</th><th scope="col">Period</th><th scope="col">Whose</th></tr></thead><tbody>';
  c.figures.forEach(function (f) {
    h += '<tr><td>' + esc(f.label) + (f.baseline ? '<br><span class="tx3-path">baseline: ' + esc(f.baseline) + '</span>' : '') + '</td>' +
      '<td class="tx3-num">' + esc(fmt(f)) + '</td>' +
      '<td>' + esc(f.period) + '</td>' +
      '<td>' + (f.url ? '<a href="' + esc(f.url) + '" rel="noreferrer">' + esc(f.scorer || 'source') + '</a>' : esc(f.scorer || '')) +
      '<br><span class="tx3-path">' + esc((f.file || 'scenarios') + '.json → ' + f.path) + '</span></td></tr>';
  });
  return h + '</tbody></table></div>';
}

function cardHtml(c) {
  var h = '<details class="tx3-card" id="tx3-card-' + esc(c.id) + '">' +
    '<summary><span class="tx3-card__n">Scenario ' + c.n + '</span>' +
    '<h3 class="tx3-card__title">' + esc(c.title) + '</h3>' +
    '<p class="tx3-card__what">' + esc(c.whatChanges) + '</p>' +
    '<div class="tx3-card__foot">' + badge(c.evidence) + '<span class="tx3-card__more">Open</span></div></summary>' +
    '<div class="tx3-body">';

  h += '<div class="tx3-apply">';
  if (c.kind === 'published') {
    h += '<button type="button" disabled title="The sandbox has no lever for this policy">No sandbox lever for this one</button>';
  } else {
    h += '<button type="button" data-apply="' + esc(c.id) + '" data-variant="-1">' +
      (c.kind === 'baseline' ? 'Reset the sandbox to current law' : c.kind === 'spend' ? 'Point the sandbox at this' : 'Load this into the sandbox') + '</button>';
    (c.variants || []).forEach(function (vr, i) {
      h += '<button type="button" class="tx3-apply--alt" data-apply="' + esc(c.id) + '" data-variant="' + i + '">' + esc(vr.label) + '</button>';
    });
  }
  h += '</div>';
  (c.variants || []).forEach(function (vr) { h += '<p class="tx3-apply__blurb">' + esc(vr.blurb) + '</p>'; });
  h += '<p class="tx3-applied" id="tx3-applied-' + esc(c.id) + '" hidden></p>';

  if (c.kind === 'spend') {
    h += '<h4>What it costs, and how far your settings go</h4>' +
      '<div class="tx3-cost">' + esc(usd(c.annualCostBn)) + ' a year</div>' +
      '<div class="tx3-cost-sub">' + esc(c.annualCostBasis) + '</div>' +
      '<p class="tx3-cost-sub" id="tx3-cover-' + esc(c.id) + '"></p>';
    h += '<h4>What the evidence says about poverty</h4>' +
      '<p>' + esc(c.povertyEvidence.headline) + '</p>' +
      '<p class="tx3-src">' + esc(c.povertyEvidence.scorer) + '. ' + esc(c.povertyEvidence.caveat) + '</p>';
    if (c.povertyEvidence.series) {
      // A separate class from the figures table: this is a two-column reading of a
      // series whose per-year provenance is in the figures table below it.
      h += '<div class="tx3-figs-wrap"><table class="tx3-figs tx3-mini"><caption class="tx-sr">Child poverty by year; each year’s source is in the figures table below</caption>' +
        '<thead><tr><th scope="col">Year</th><th scope="col">Children below the poverty line</th></tr></thead><tbody>';
      c.povertyEvidence.series.forEach(function (p) { h += '<tr><td>' + p.year + '</td><td class="tx3-num">' + p.value + '%</td></tr>'; });
      h += '</tbody></table></div>';
    }
  }

  h += '<h4>Why</h4>';
  c.why.forEach(function (p) { h += '<p>' + esc(p) + '</p>'; });

  (c.notes || []).forEach(function (n) { h += '<div class="tx3-warn">' + esc(n) + '</div>'; });

  h += '<h4>What happens, as published</h4>' + figuresTable(c);

  h += '<h4>What critics say</h4>';
  (c.critics || []).forEach(function (x) {
    h += '<div class="tx3-critic"><b>' + esc(x.claim) + '</b>' + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>';
  });

  if (c.engineNote) h += '<h4>How this tool scores it</h4><p>' + esc(c.engineNote) + '</p>';

  h += '<h4>Sources</h4>';
  (c.sources || []).forEach(function (s) {
    h += '<p class="tx3-src"><a href="' + esc(s.url) + '" rel="noreferrer">' + esc(s.text) + '</a></p>';
  });
  h += '<p class="tx3-src"><a href="/learn/tax-explorer/methodology.html">Full methodology →</a></p>';

  return h + '</div></details>';
}

// Cards are NUMBERED in the order the build plan lists them and GROUPED for
// reading. The numbers stay put so a card can be cited; the grouping is what
// makes twelve cards navigable rather than a wall.
var GROUP_ORDER = ['You are here', 'Where the money is', 'Tax the top', 'Replace the system', 'What you could do with it'];
function render() {
  var h = '';
  GROUP_ORDER.forEach(function (g) {
    var inGroup = cards.filter(function (c) { return c.group === g; });
    if (!inGroup.length) return;
    h += '<div class="tx3-groupbar">' + esc(g) + '</div>';
    inGroup.forEach(function (c) { h += cardHtml(c); });
  });
  // Anything whose group is not in the list above still renders, rather than
  // silently disappearing.
  cards.filter(function (c) { return GROUP_ORDER.indexOf(c.group) === -1; })
    .forEach(function (c) { h += cardHtml(c); });
  grid.innerHTML = h;
}

/* ──────────────────────────── applying a card ────────────────────────── */
function cardById(id) { for (var i = 0; i < cards.length; i++) if (cards[i].id === id) return cards[i]; return null; }

function apply(id, variantIndex) {
  var c = cardById(id);
  if (!c) return;
  var lev = variantIndex >= 0 && c.variants && c.variants[variantIndex] ? c.variants[variantIndex].levers : c.levers;
  A2.writeLevers(lev, c.overlayKeys || null);
  A2.update();
  syncUrl();
  var msg = document.getElementById('tx3-applied-' + id);
  if (msg) {
    msg.textContent = c.overlayKeys
      ? 'Pointed at this. Your tax settings above are untouched — raise revenue with any other card and this one will tell you how far it goes.'
      : 'Loaded into the sandbox above.';
    msg.hidden = false;
  }
  var sandbox = document.getElementById('sandbox');
  if (sandbox && sandbox.scrollIntoView) {
    sandbox.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
}

grid.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('[data-apply]') : null;
  if (!b) return;
  apply(b.getAttribute('data-apply'), Number(b.getAttribute('data-variant')));
});

/* ─────────────────── the spending cards' live coverage line ──────────── */
function refreshCoverage() {
  var r;
  try { r = M.model(A2.readLevers(), A2.readAssumptions()); } catch (e) { return; }
  var annual = r.revenue.tenYear.net / 10;
  cards.filter(function (c) { return c.kind === 'spend'; }).forEach(function (c) {
    var el = document.getElementById('tx3-cover-' + c.id);
    if (!el) return;
    if (annual <= 0) {
      el.textContent = 'Your settings raise nothing to spend right now. Load a revenue card and come back.';
      return;
    }
    var years = annual / c.annualCostBn;
    el.textContent = 'On your current settings the sandbox raises ' + usd(annual) + ' a year, which is ' +
      (years >= 1 ? years.toFixed(1) + ' times this programme’s annual cost' : Math.round(years * 100) + '% of this programme’s annual cost') + '. ' +
      'That is one published figure divided by another, and nothing else.';
  });
}

/* ───────────────────────────── URL state ─────────────────────────────── */
function syncUrl() {
  if (!window.history || !history.replaceState) return;
  var s = CARDS.encodeState(A2.readLevers(), A2.readAssumptions());
  history.replaceState(null, '', location.pathname + '?s=' + s + location.hash);
}
function readUrl() {
  var m = /[?&]s=([A-Za-z0-9\-_]+)/.exec(location.search);
  if (!m) return;
  var st = CARDS.decodeState(m[1]);
  if (!st) return;                       // a malformed link leaves current law alone
  A2.writeLevers(st.levers, null);
  A2.writeAssumptions(st.assumptions);
  A2.update();
}
var shareBtn = document.getElementById('tx3-share'), shareNote = document.getElementById('tx3-share-note');
if (shareBtn) {
  shareBtn.addEventListener('click', function () {
    syncUrl();
    var url = location.href;
    function done(msg) { if (shareNote) shareNote.textContent = msg; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done('Copied. The link carries every setting.'); },
        function () { done('Couldn’t copy automatically — the address bar now holds your settings.'); });
    } else {
      done('Your settings are in the address bar; copy the link from there.');
    }
  });
}

/* ─────────────────────────────── start ───────────────────────────────── */
render();
var form = document.getElementById('tx-levers');
if (form) {
  form.addEventListener('input', refreshCoverage);
  form.addEventListener('change', refreshCoverage);
}
readUrl();
refreshCoverage();
})();
