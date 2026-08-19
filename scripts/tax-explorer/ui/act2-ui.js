/* ===== Act 2 — UI layer. Reads the form, calls the pure model, renders. ===== */
(function () {
'use strict';
var M = window.TaxLadderModel;
if (!M) return;
var model = M.model, usd = M.usd, D = M.D;
var POS = '#2a78d6';   // more revenue / pays more  (dataviz palette, validated)
var NEG = '#eb6834';   // less revenue / pays less
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
var radio = function (name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; };

/* ─────────────────────────── read the levers ─────────────────────────── */
function readLevers() {
  var L = M.clone(M.CURRENT_LAW);
  L.topRate = Number($('tx-topRate').value);
  L.topRateThreshold = $('tx-topRateThreshold').value;
  L.capGainsRate = Number($('tx-capGainsRate').value) + 3.8;   // slider is statutory; the model works in all-in terms
  L.taxGainsAtDeath = $('tx-taxGainsAtDeath').checked;
  L.stepUp = $('tx-stepUp').value;
  L.corporateRate = Number($('tx-corporateRate').value);
  L.payrollCap = radio('tx-payrollCap');
  L.payrollBenefitCredit = $('tx-payrollBenefitCredit').checked;
  L.loopholes = {
    s199a: $('tx-lp-s199a').checked,
    health: $('tx-lp-health').value,
    salt: $('tx-lp-salt').checked,
    mortgage: $('tx-lp-mortgage').checked,
    muniPA: $('tx-lp-muniPA').checked,
    carriedInterest: $('tx-lp-carriedInterest').checked,
    cryptoWash: $('tx-lp-cryptoWash').checked
  };
  L.enforcement = Number($('tx-enforcement').value);
  L.system = radio('tx-system');
  L.flatRate = Number($('tx-flatRate').value);
  L.vatBase = $('tx-vatBase').value;
  L.wealthScorer = $('tx-wealthScorer').value;
  L.fairtaxAssumption = $('tx-fairtaxAssumption').value;
  L.directToTransfers = $('tx-directToTransfers').checked;
  return L;
}
// The inverse of readLevers. Act 3 scenario cards are stored lever objects, and a
// card is applied by writing it into these same controls and letting the normal
// input/change loop re-render — never by scoring the card on a second path.
function writeLevers(L, only) {
  function want(k) { return !only || only.indexOf(k) > -1; }
  function setRadio(name, val) {
    var el = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
    if (el) el.checked = true;
  }
  if (want('topRate')) $('tx-topRate').value = L.topRate;
  if (want('topRateThreshold')) $('tx-topRateThreshold').value = L.topRateThreshold;
  if (want('capGainsRate')) $('tx-capGainsRate').value = Math.round((L.capGainsRate - 3.8) * 10) / 10;
  if (want('taxGainsAtDeath')) $('tx-taxGainsAtDeath').checked = !!L.taxGainsAtDeath;
  if (want('stepUp')) $('tx-stepUp').value = L.stepUp;
  if (want('corporateRate')) $('tx-corporateRate').value = L.corporateRate;
  if (want('payrollCap')) setRadio('tx-payrollCap', L.payrollCap);
  if (want('payrollBenefitCredit')) $('tx-payrollBenefitCredit').checked = !!L.payrollBenefitCredit;
  if (want('loopholes')) {
    $('tx-lp-s199a').checked = !!L.loopholes.s199a;
    $('tx-lp-health').value = L.loopholes.health;
    $('tx-lp-salt').checked = !!L.loopholes.salt;
    $('tx-lp-mortgage').checked = !!L.loopholes.mortgage;
    $('tx-lp-muniPA').checked = !!L.loopholes.muniPA;
    $('tx-lp-carriedInterest').checked = !!L.loopholes.carriedInterest;
    $('tx-lp-cryptoWash').checked = !!L.loopholes.cryptoWash;
  }
  if (want('enforcement')) $('tx-enforcement').value = L.enforcement;
  if (want('system')) setRadio('tx-system', L.system);
  if (want('flatRate')) $('tx-flatRate').value = L.flatRate;
  if (want('vatBase')) $('tx-vatBase').value = L.vatBase;
  if (want('wealthScorer')) $('tx-wealthScorer').value = L.wealthScorer;
  if (want('fairtaxAssumption')) $('tx-fairtaxAssumption').value = L.fairtaxAssumption;
  if (want('directToTransfers')) $('tx-directToTransfers').checked = !!L.directToTransfers;
}
function writeAssumptions(A) {
  // The select's option values are literal strings ('0.40', not '0.4'), so match by value.
  var etiSel = $('tx-eti');
  for (var i = 0; i < etiSel.options.length; i++) {
    if (Number(etiSel.options[i].value) === Number(A.eti)) { etiSel.selectedIndex = i; break; }
  }
  $('tx-holdEtiFixed').checked = !!A.holdEtiFixed;
  $('tx-corpLaborShare').value = A.corpLaborShare;
  var el = document.querySelector('input[name="tx-multiplierRegime"][value="' + A.multiplierRegime + '"]');
  if (el) el.checked = true;
  $('tx-lens').value = A.lens;
}

function readAssumptions() {
  var A = M.clone(M.DEFAULT_ASSUMPTIONS);
  A.eti = Number($('tx-eti').value);
  A.holdEtiFixed = $('tx-holdEtiFixed').checked;
  A.corpLaborShare = Number($('tx-corpLaborShare').value);
  A.multiplierRegime = radio('tx-multiplierRegime');
  A.lens = $('tx-lens').value;
  return A;
}

/* ───────────────────────── conditional lever bits ────────────────────── */
function syncVisibility() {
  var sys = radio('tx-system');
  $('tx-flatRate-wrap').hidden = sys !== 'flat';
  $('tx-vatBase-wrap').hidden = sys !== 'vat5';
  $('tx-wealthScorer-wrap').hidden = sys !== 'wealth';
  $('tx-fairtax-wrap').hidden = sys !== 'fairtax';
  $('tx-benefitCredit-wrap').hidden = radio('tx-payrollCap') !== 'eliminate';
  $('tx-topRate-val').textContent = Number($('tx-topRate').value).toFixed(1) + '%';
  var cgS = Number($('tx-capGainsRate').value);
  $('tx-capGainsRate-val').textContent = cgS.toFixed(1) + '%';
  var cgNote = $('tx-capGainsRate-val').nextElementSibling;
  if (cgNote) cgNote.textContent = '= ' + (cgS + 3.8).toFixed(1) + '% all-in, once the 3.8% net investment income tax is counted';
  $('tx-corporateRate-val').textContent = Number($('tx-corporateRate').value).toFixed(0) + '%';
  $('tx-flatRate-val').textContent = Number($('tx-flatRate').value).toFixed(1) + '%';
  $('tx-corpLaborShare-val').textContent = Number($('tx-corpLaborShare').value).toFixed(0) + '%';
  var e = Number($('tx-enforcement').value);
  $('tx-enforcement-val').textContent = e === 0 ? 'no change'
    : e > 0 ? 'restore ' + e + '% of the cuts already made'
    : 'cut a further ' + Math.abs(e) + '% of a $20 billion rescission';
}

/* ───────────────────────────── renderers ─────────────────────────────── */
function bar(track, value, scale, color) {
  // scale: max absolute value mapped to half the track
  var half = 50, w = Math.min(half, Math.abs(value) / scale * half);
  return '<div class="tx-wf-zero" style="left:50%"></div>' +
    '<div class="tx-' + track + '-fill" style="background:' + color + ';' +
    (value >= 0 ? 'left:50%;width:' + w + '%' : 'right:50%;width:' + w + '%') + '"></div>';
}
function detailsTable(summary, head, rows) {
  var h = '<details><summary>' + esc(summary) + '</summary><div class="tx-table-wrap"><table><thead><tr>';
  head.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
  h += '</tr></thead><tbody>';
  rows.forEach(function (r) {
    h += '<tr>';
    r.forEach(function (c) { h += '<td>' + (c === null ? '—' : esc(c)) + '</td>'; });
    h += '</tr>';
  });
  return h + '</tbody></table></div></details>';
}

function renderRevenue(r, L) {
  var t = r.revenue.tenYear, comps = r.revenue.components;
  var rows = [
    { k: 'On paper (static)', v: t.static, c: t.static >= 0 ? POS : NEG },
    { k: 'Lost to avoidance and timing', v: t.behavioral, c: NEG },
    { k: 'Enforcement', v: t.enforcement, c: t.enforcement >= 0 ? POS : NEG }
  ];
  var scale = Math.max.apply(null, rows.map(function (x) { return Math.abs(x.v); }).concat([Math.abs(t.net), 1]));
  var h = '<h3>What it raises — or costs</h3>' +
    '<p class="tx-out-def">Ten-year totals against current law. Positive means more revenue. Growth effects are shown separately below and are never added in here.</p>';
  if (!comps.length && !r.unscored.length) {
    h += '<div class="tx-headline">No change yet</div><div class="tx-headline-sub">Move a lever on the left and everything on this page updates.</div>';
    $('tx-out-revenue').innerHTML = h;
    return;
  }
  h += '<div class="tx-headline' + (t.net < 0 ? ' tx-headline--neg' : '') + '">' +
    (t.net >= 0 ? '+' : '') + esc(usd(t.net)) + '</div>' +
    '<div class="tx-headline-sub">over ten years' +
    (t.lo !== t.hi ? ' · across published estimates: ' + esc(usd(t.lo)) + ' to ' + esc(usd(t.hi)) : '') +
    ' · about ' + esc(usd(t.net / 10)) + ' a year</div>';
  h += '<div class="tx-waterfall">';
  rows.forEach(function (x) {
    h += '<div class="tx-wf-row' + (x.v === 0 ? ' tx-wf-row--zero' : '') + '"><span>' + esc(x.k) + '</span>' +
      '<span class="tx-wf-track">' + bar('wf', x.v, scale, x.c) + '</span>' +
      '<span class="tx-wf-val">' + (x.v === 0 ? 'none' : (x.v > 0 ? '+' : '') + esc(usd(x.v))) + '</span></div>';
  });
  h += '<div class="tx-wf-row tx-wf-row--net"><span><strong>Net</strong></span>' +
    '<span class="tx-wf-track">' + bar('wf', t.net, scale, t.net >= 0 ? POS : NEG) + '</span>' +
    '<span class="tx-wf-val"><strong>' + (t.net >= 0 ? '+' : '') + esc(usd(t.net)) + '</strong></span></div></div>';
  h += '<div class="tx-legend-key"><span><b style="background:' + POS + '"></b>raises revenue</span>' +
    '<span><b style="background:' + NEG + '"></b>loses revenue</span></div>';

  if (comps.length > 1) {
    h += '<p class="tx-out-def" style="margin-top:.7rem;">' + comps.length + ' changes are active. Because each was scored on its own, against a world where the others still existed, treat the total as an order of magnitude rather than a sum — see note 14.</p>';
  }
  if (r.unscored.length) {
    h += '<div class="tx-excluded"><strong>Not in the total, because nobody has published a figure:</strong><ul>';
    r.unscored.forEach(function (u) { h += '<li>' + esc(u.label) + ' — ' + esc(u.reason) + '</li>'; });
    h += '</ul></div>';
  }
  h += detailsTable('View every component, with its window, baseline and scorer',
    ['Change', 'Ten-year effect', 'Budget window', 'Baseline', 'Scorer'],
    comps.map(function (c) {
      return [c.label, (c.net >= 0 ? '+' : '') + usd(c.net) + (c.range ? ' (range ' + usd(c.range[0]) + ' to ' + usd(c.range[1]) + ')' : ''),
        c.window, c.baseline === 'pre-obbba' ? 'pre-OBBBA — read with care' : 'post-OBBBA', c.source];
    }));
  $('tx-out-revenue').innerHTML = h;
}

var classMetric = 'rate';
var statusTimer = null;
function renderClass(r) {
  var rows = r.byClass;
  var vals = rows.map(function (g) { return classMetric === 'rate' ? g.dAvgRatePP : g.dAfterTaxPct; });
  var scale = Math.max.apply(null, vals.map(Math.abs).concat([0.05]));
  var h = '<h3>Who pays</h3>' +
    '<p class="tx-out-def">' + (classMetric === 'rate'
      ? 'Change in the average federal tax rate each group pays, in percentage points. Positive means that group pays more.'
      : 'Change in each group’s after-tax income, in percent. Positive means that group keeps more.') +
    ' Groups are CBO’s, for 2022; the top 1% sits <em>inside</em> the highest quintile rather than beside it. See note 13.</p>';
  h += '<div class="tx-metric-toggle" role="group" aria-label="Which measure">' +
    '<button type="button" class="tx-legend-btn" data-metric="rate" aria-pressed="' + (classMetric === 'rate') + '">Average tax rate</button>' +
    '<button type="button" class="tx-legend-btn" data-metric="income" aria-pressed="' + (classMetric === 'income') + '">After-tax income</button></div>';
  h += '<div class="tx-class-rows">';
  rows.forEach(function (g, i) {
    var v = vals[i];
    var col = classMetric === 'rate' ? (v >= 0 ? POS : NEG) : (v >= 0 ? POS : NEG);
    h += '<div class="tx-class-row' + (g.key === 'top1' ? ' tx-class-row--sub' : '') + '">' +
      '<span class="tx-class-lbl">' + esc(g.label) + (g.key === 'top1' ? ' <span class="tx-lever-now">(inside the top quintile)</span>' : '') + '</span>' +
      '<span class="tx-class-track"><div class="tx-wf-zero" style="left:50%"></div>' +
      '<div class="tx-class-fill" style="background:' + col + ';' +
      (v >= 0 ? 'left:50%;width:' + Math.min(50, Math.abs(v) / scale * 50) + '%' : 'right:50%;width:' + Math.min(50, Math.abs(v) / scale * 50) + '%') + '"></div></span>' +
      '<span class="tx-class-val" style="color:' + (v === 0 ? 'var(--gray)' : 'var(--dark)') + '">' +
      (v > 0 ? '+' : '') + v.toFixed(2) + (classMetric === 'rate' ? ' pp' : '%') + '</span></div>';
  });
  h += '</div>';
  h += '<div class="tx-legend-key"><span><b style="background:' + POS + '"></b>' + (classMetric === 'rate' ? 'pays a higher rate' : 'keeps more income') + '</span>' +
    '<span><b style="background:' + NEG + '"></b>' + (classMetric === 'rate' ? 'pays a lower rate' : 'keeps less income') + '</span></div>';

  var cov = r.coverage;
  if (cov.total > 0 && cov.allocated === 0) {
    h += '<div class="tx-why-warn"><strong>No published distributional split exists for any change you have made,</strong> ' +
      'so the bars above are all zero. The changes in question are named just below.</div>';
  }
  if (cov.excluded.length || cov.top1Excluded.length) {
    h += '<div class="tx-excluded">';
    if (cov.excluded.length) {
      h += '<strong>Left out of this chart entirely</strong> — ' + cov.allocated + ' of ' + cov.total +
        ' active changes have a published distributional split. These do not:<ul>';
      cov.excluded.forEach(function (x) { h += '<li>' + esc(x) + '</li>'; });
      h += '</ul>';
    }
    if (cov.top1Excluded.length) {
      h += '<p style="margin:.4rem 0 0;">The top-1% bar carries none of the following, because their scorers publish a quintile or decile share but no top-1% share: ' +
        cov.top1Excluded.map(esc).join('; ') + '.</p>';
    }
    h += '</div>';
  }
  h += detailsTable('View the numbers behind this chart',
    ['Group', 'Change in average federal tax rate (pp)', 'Change in after-tax income (%)', 'Average federal tax rate today (2022)'],
    rows.map(function (g) {
      return [g.label, (g.dAvgRatePP > 0 ? '+' : '') + g.dAvgRatePP.toFixed(2),
        (g.dAfterTaxPct > 0 ? '+' : '') + g.dAfterTaxPct.toFixed(2), g.currentAvgRate.toFixed(1) + '%'];
    }));
  h += '<p class="tx-source">Group incomes, household counts and current average rates: CBO, <em>The Distribution of Household Income, 2022</em> (January 2026 supplemental data).</p>';
  $('tx-out-class').innerHTML = h;
  Array.prototype.forEach.call($('tx-out-class').querySelectorAll('[data-metric]'), function (b) {
    b.addEventListener('click', function () { classMetric = b.getAttribute('data-metric'); update(); });
  });
}

function renderGdp(r) {
  var lo = r.gdp.loPct, hi = r.gdp.hiPct;
  var AX = 3;   // fixed -3% .. +3% axis so the band never rescales under you
  function posOf(v) { return (Math.max(-AX, Math.min(AX, v)) + AX) / (2 * AX) * 100; }
  var h = '<h3>What it might do to the economy</h3>' +
    '<p class="tx-out-def">A shaded range, never a line. The endpoints are the most and least favourable outcomes across the published estimates your current dials select — not a forecast, and not a probability.</p>';
  h += '<div class="tx-band-wrap"><div class="tx-band-track" role="img" aria-label="Estimated effect on GDP: a band from ' + lo + ' to ' + hi + ' percent of GDP.">' +
    '<div class="tx-band-zero" style="left:' + posOf(0) + '%"></div>' +
    '<div class="tx-band-fill" style="left:' + posOf(Math.min(lo, hi)) + '%;width:' + Math.max(0.6, posOf(Math.max(lo, hi)) - posOf(Math.min(lo, hi))) + '%"></div>' +
    '</div><div class="tx-band-axis"><span>−3%</span><span>0</span><span>+3%</span></div></div>';
  h += '<div class="tx-headline' + (hi < 0 ? ' tx-headline--neg' : '') + '" style="font-size:1.25rem;">' +
    (lo === 0 && hi === 0 ? 'no change' : (lo > 0 ? '+' : '') + lo.toFixed(1) + '% to ' + (hi > 0 ? '+' : '') + hi.toFixed(1) + '% of GDP') + '</div>' +
    '<div class="tx-headline-sub">in the tenth year, under the <strong>' + esc(r.gdp.lensLabel) + '</strong> lens and ' +
    (r.gdp.regime === 'recession' ? 'recession' : 'normal') + ' conditions</div>';
  h += '<div class="tx-why-warn"><strong>This dial is contested.</strong> ' +
    esc(r.gdp.citations[0].src.split(',')[0]) + ' finds fiscal policy considerably more effective in recessions. ' +
    esc(r.gdp.citations[1].src.split(',')[0]) + ' find, using historical US data covering multiple wars and deep recessions, ' + esc(D.params.mult.rejects.q) + '. Both are published, peer-reviewed, and pointed in opposite directions.</div>';
  h += '<ul style="font-size:.82rem;color:var(--gray);margin:.6rem 0 0 1rem;padding:0;">';
  r.gdp.notes.filter(function (n) { return n && n.trim(); }).forEach(function (n) { h += '<li style="margin-bottom:.3rem;">' + esc(n) + '</li>'; });
  h += '</ul>';
  h += '<p class="tx-source">Lens: ' + esc(r.gdp.lensSource) + '. Multipliers: ' + esc(D.params.mult.sCbo) +
    ' Spending propensities: ' + esc(D.params.mpc.sJP) + ' Low bound: ' + esc(D.params.mpc.sFed) + '</p>';
  $('tx-out-gdp').innerHTML = h;
}

function renderPoverty(r) {
  var p = r.poverty;
  var h = '<h3>And if you spent it on people?</h3>';
  if (!p.directed) {
    h += '<p class="tx-out-def">Tick “spend whatever this raises on transfers to households” in the dials to use this panel.</p>';
  } else {
    h += '<div class="tx-headline' + (p.annualBn < 0 ? ' tx-headline--neg' : '') + '" style="font-size:1.35rem;">' +
      (p.annualBn >= 0 ? '' : '−') + esc(usd(Math.abs(p.annualBn))) + ' a year</div>' +
      '<div class="tx-headline-sub">available for transfer spending, on your current settings</div>';
  }
  h += '<div class="tx-why-warn"><strong>No poverty rate is shown here.</strong> ' + esc(p.note) + '</div>';
  h += '<p style="font-size:.9rem;"><strong>' + esc(p.anchor.label) + ':</strong> ' + esc(p.anchor.text) + '</p>';
  var pts = p.anchor.series;
  h += detailsTable('The Supplemental Poverty Measure, year by year', ['Year', 'Share of people below the SPM threshold'],
    pts.map(function (x) { return [String(x[0]), x[1].toFixed(1) + '%']; }));
  h += '<p class="tx-source">Source: ' + esc(p.anchor.source) + '. ' + esc(p.anchor.caveat) + '</p>';
  $('tx-out-poverty').innerHTML = h;
}

function renderWhy(r) {
  var h = '<h3 style="color:var(--blue);font-size:1.1rem;margin:1.4rem 0 .6rem;">Why you got that answer</h3>';
  if (!r.why.length) {
    h += '<div class="tx-why tx-why--empty"><p>Nothing has changed yet. Move a lever and this panel will walk you through the mechanism behind every number above — including which assumption is doing the work, and who disputes it.</p></div>';
    $('tx-out-why').innerHTML = h;
    return;
  }
  r.why.forEach(function (w) {
    h += '<div class="tx-why"><h4>' + esc(w.title) + '</h4>';
    w.chain.forEach(function (c) { h += '<p>' + esc(c) + '</p>'; });
    w.warnings.forEach(function (x) { h += '<div class="tx-why-warn"><strong>Worth knowing:</strong> ' + esc(x) + '</div>'; });
    if (w.params.length) h += '<div class="tx-why-params">Settings behind this: ' + w.params.map(esc).join(' · ') + '</div>';
    if (w.links.length) {
      h += '<div class="tx-why-links">Sources: ' + w.links.filter(function (l) { return l && l.url; }).map(function (l) {
        return '<a href="' + esc(l.url) + '" rel="noreferrer">' + esc(l.text) + '</a>';
      }).join(' · ') + '</div>';
    }
    h += '</div>';
  });
  $('tx-out-why').innerHTML = h;
}

/* ───────────────────────────── the loop ──────────────────────────────── */
function update() {
  syncVisibility();
  var L = readLevers(), A = readAssumptions();
  var r = model(L, A);
  renderRevenue(r, L);
  renderClass(r);
  renderGdp(r);
  renderPoverty(r);
  renderWhy(r);
  // One short, debounced announcement rather than five live regions re-reading
  // themselves on every slider step.
  clearTimeout(statusTimer);
  statusTimer = setTimeout(function () {
    var t = r.revenue.tenYear.net, top1 = r.byClass[5], low = r.byClass[0];
    $('tx-status').textContent = !r.revenue.components.length
      ? 'No change from current law.'
      : 'Net revenue ' + (t >= 0 ? 'up ' : 'down ') + usd(Math.abs(t)) + ' over ten years. ' +
        'The lowest quintile\u2019s average federal tax rate changes by ' + low.dAvgRatePP.toFixed(2) + ' points, the top 1 percent\u2019s by ' + top1.dAvgRatePP.toFixed(2) + ' points. ' +
        'Estimated effect on GDP: a band from ' + r.gdp.loPct.toFixed(1) + ' to ' + r.gdp.hiPct.toFixed(1) + ' percent.';
  }, 450);
  if (r.guards.selfFinancingViolation && window.console) {
    window.console.error('Tax Ladder guardrail tripped:', r.guards.violations);
  }
}

var form = $('tx-levers');
if (form) {
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  $('tx-reset').addEventListener('click', function () {
    form.reset();
    $('tx-topRate').value = 37; $('tx-capGainsRate').value = 23.8; $('tx-corporateRate').value = 21;
    $('tx-flatRate').value = 17; $('tx-enforcement').value = 0; $('tx-corpLaborShare').value = 25;
    update();
  });
  update();
}

// The only surface Act 3 talks to. A scenario card writes the controls and calls
// update(); it never calls the model itself. One scoring path, by construction.
window.TaxLadderAct2 = {
  update: update,
  readLevers: readLevers,
  readAssumptions: readAssumptions,
  writeLevers: writeLevers,
  writeAssumptions: writeAssumptions
};
})();
