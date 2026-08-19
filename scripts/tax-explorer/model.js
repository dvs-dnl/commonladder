/**
 * model.js — The Tax Ladder, Act 2 engine.
 *
 * A pure, deterministic function: model(levers, assumptions) -> results.
 * No I/O, no Date, no Math.random, no external libraries. The same source runs
 * headlessly under node (scripts/tax-explorer/test-model.js) and inline in
 * learn/tax-explorer/index.html — scripts/tax-explorer/inject-act2.js splices
 * this exact text into the page so the two can never drift.
 *
 * FOUR LAYERS (gameplan §5):
 *   0  data      — every number resolves to learn/tax-explorer/data/ via act2-data.json
 *   1  static    — rate and base changes applied across IRS SOI Table 3.5 (TY2023),
 *                  or, for pre-scored reforms, the published conventional score
 *   2  behavioral— ETI for ordinary income (coupled to the active base), a separate
 *                  realization-elasticity regime for capital gains
 *   3  macro     — a GDP BAND only, never a point, and never folded into revenue
 *   4  why       — a templated causal chain naming its own parameters
 *
 * THINGS THIS ENGINE WILL NOT DO, BY CONSTRUCTION:
 *   · fold macro feedback into the revenue number (so no cut can finance itself)
 *   · emit a point GDP estimate
 *   · average two contested estimates
 *   · hold ETI fixed while the user broadens the base, without saying so
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./act2-data.json'));
  } else {
    root.TaxLadderModel = factory(JSON.parse(document.getElementById('act2-data').textContent));
  }
}(typeof self !== 'undefined' ? self : this, function (D) {
'use strict';

/* ═══════════════════════════════ constants ═══════════════════════════════ */

var GROUPS = ['lowest', 'second', 'middle', 'fourth', 'highest', 'top1'];
var GROUP_LABEL = {
  lowest: 'Lowest quintile', second: 'Second quintile', middle: 'Middle quintile',
  fourth: 'Fourth quintile', highest: 'Highest quintile', top1: 'Top 1%'
};
var ORD = D.soi.ordRates;                    // [10,12,22,24,32,35,37]
var CG = D.soi.cgRates;                      // [0,15,20,25,28]
var OI = 6;                                  // first ordinary-rate column in soi.c
var CI = 6 + ORD.length;                     // first capital-gains column
var I37 = OI + ORD.indexOf(37);
var I20 = CI + CG.indexOf(20);
var TH = 1e6;                                // SOI amounts are $ thousands -> $ billions
var YEARS = 10;                              // the tool's budget window
var CUR_TOP = 37, CUR_CG = 23.8, CUR_CORP = 21;

// Diamond & Saez's own two anchors for the same population in the same year:
// 0.57 on the current (narrow) taxable-income base, 0.17 on a broad base.
// The engine scales the selected ETI along that ratio as the user broadens the base.
var ETI_BROAD_RATIO = D.params.eti.topBroad / D.params.eti.top;   // 0.17 / 0.57

// Every base-broadening toggle, weighted by its published on-paper size where JCT
// publishes one and by its annualised conventional score where JCT does not.
// The weights only set how fast ETI falls; they never enter a revenue figure.
var BROADENERS = [
  { id: 'stepUp',          w: D.statics.stepUp },
  { id: 's199a',           w: D.statics.s199a },
  { id: 'health',          w: D.statics.health },
  { id: 'salt',            w: D.statics.salt },
  { id: 'mortgage',        w: D.statics.mortgageAnnual },
  { id: 'muniPA',          w: D.scores.muni_private.v / YEARS },
  { id: 'carriedInterest', w: D.scores.carried_interest.v / YEARS },
  { id: 'cryptoWash',      w: D.scores.crypto_wash.v / YEARS }
];
var BROADENER_TOTAL = BROADENERS.reduce(function (s, b) { return s + b.w; }, 0);

var LENS = {
  cbo: {
    label: 'CBO-style (deficits crowd out private investment)',
    // CBO 2005: the second five years could ADD as much as 5% to the loss; models
    // carrying both supply and demand effects offset "somewhat less than 15 percent".
    lo: D.params.feedback.cbo2005second[0] / 100,   // -5%: CBO's published NEGATIVE case
    hi: D.params.feedback.cboBoth / 100,
    src: 'CBO, Analyzing the Economic and Budgetary Effects of a 10 Percent Cut in Income Tax Rates (Dec 2005)',
    url: D.params.feedback.uCbo2005
  },
  consensus: {
    label: 'Consensus (the average across published models)',
    lo: D.params.feedback.crfbExt[0] / 100,
    hi: D.params.feedback.galeAvg / 100,
    src: 'CRFB (Jun 2024), 1–14% for the TCJA extension; Brookings/Gale (Feb 2020), about a quarter of the TCJA’s ten-year loss on average across models',
    url: D.params.feedback.uGale
  },
  taxfoundation: {
    label: 'Tax Foundation-style (full capital adjustment)',
    lo: 14 / 100,
    hi: D.params.feedback.cbo2005second[1] / 100,
    src: 'CRFB’s by-shop table puts Tax Foundation above 14% where every other shop it lists is at or below 5%; CBO’s 2005 upper bound for a second five-year window is 32%',
    url: D.params.feedback.uCrfb
  }
};

// CRFB's arithmetic for why a cut cannot break even on revenue: it would need to
// produce $5 to $6 of economic activity per $1 of cost. We use the two endpoints
// as the conversion between a revenue-feedback share and a GDP effect. OUR
// derivation from CRFB's published ratio, labelled as such everywhere it shows.
var GDP_PER_DOLLAR = [5, 6];

// Every why-panel links here. See methodology.html — parameters, quotes, derivations.
var METHODOLOGY_URL = '/learn/tax-explorer/methodology.html';

var MULT = {
  lowmid: [D.params.mult.cboLowMid.low, D.params.mult.cboLowMid.high],   // 0.3 – 1.5
  high:   [D.params.mult.cboHigh.low,   D.params.mult.cboHigh.high]      // 0.1 – 0.6
};
// Ramey & Zubairy find multipliers "below unity irrespective of the amount of slack
// in the economy" — so the non-recession regime caps the upper bound at 1.
var RZ_CAP = 1.0;

// MPC gradient. Low bound: Boston Fed by WEALTH quintile (the authors call their own
// estimates low-end). High bound: Jappelli & Pistaferri, 65% at the lowest
// cash-on-hand percentile falling to 30% for the richest — the intermediate
// quintiles are OUR linear interpolation between the two published endpoints.
var MPC_LO = D.params.mpc.fedByWealthQuintile.concat([D.params.mpc.fedByWealthQuintile[4]]);
var MPC_HI = (function () {
  var a = D.params.mpc.jpHigh, b = D.params.mpc.jpLow, out = [];
  for (var i = 0; i < 5; i++) out.push(a + (b - a) * i / 4);
  out.push(b);
  return out;
})();

/* ═══════════════════════════ current-law defaults ════════════════════════ */

var CURRENT_LAW = {
  topRate: CUR_TOP,
  topRateThreshold: 'current',      // 'current' | '500k' | '1m' | '2m' | '5m' | '10m'
  secondBracketRate: null,          // optional new bracket above $10M
  capGainsRate: CUR_CG,             // ALL-IN top rate: 20% statutory + 3.8% NIIT
  taxGainsAtDeath: false,
  stepUp: 'current',                // 'current' | 'carryover' | 'atDeath'
  corporateRate: CUR_CORP,
  payrollCap: 'current',            // 'current' | 'raise90pct' | 'donut250k' | 'eliminate'
  payrollBenefitCredit: true,
  loopholes: {
    s199a: false, health: 'none',   // 'none' | 'p75' | 'p50' | 'p50inc'
    salt: false, mortgage: false, muniPA: false, carriedInterest: false, cryptoWash: false
  },
  enforcement: 0,                   // -100 (a further $20B rescission) .. +100 (restore)
  system: 'current',                // 'current'|'flat'|'fairtax'|'vat5'|'wealth'|'ftt'
  flatRate: 17,
  vatBase: 'broad',                 // 'broad' | 'narrow'
  wealthScorer: 'saez_zucman',      // 'saez_zucman' | 'pwbm' | 'summers_sarin'
  fairtaxAssumption: 'low',         // 'low' | 'high' deficit impact at the legislated 23%
  directToTransfers: false
};

var DEFAULT_ASSUMPTIONS = {
  eti: 0.25,                        // 0.12 | 0.25 | 0.40 | 0.57
  holdEtiFixed: false,
  corpLaborShare: D.params.incidence.def,   // 25
  multiplierRegime: 'normal',       // 'normal' | 'recession'
  lens: 'consensus'                 // 'cbo' | 'consensus' | 'taxfoundation'
};

/* ══════════════════════════════ small helpers ════════════════════════════ */

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function usd(b) {
  var a = Math.abs(b);
  if (a >= 1000) return (b < 0 ? '-$' : '$') + (a / 1000).toFixed(a >= 10000 ? 1 : 2) + ' trillion';
  if (a >= 1) return (b < 0 ? '-$' : '$') + a.toFixed(a >= 100 ? 0 : 1) + ' billion';
  return (b < 0 ? '-$' : '$') + (a * 1000).toFixed(0) + ' million';
}
function pct(x, dp) { return (x >= 0 ? '' : '-') + Math.abs(x).toFixed(dp === undefined ? 1 : dp) + '%'; }
function THRESH(k) { return { current: 0, '500k': 500000, '1m': 1000000, '2m': 2000000, '5m': 5000000, '10m': 10000000 }[k]; }
function THRESH_LABEL(k) {
  return { current: 'the current top bracket (all filers already in it)', '500k': 'filers with AGI above $500,000',
    '1m': 'filers with AGI above $1 million', '2m': 'filers with AGI above $2 million',
    '5m': 'filers with AGI above $5 million', '10m': 'filers with AGI above $10 million' }[k];
}

/* ─────────── the AGI-class -> CBO-group crosswalk, stated in the UI ─────── */
// SOI ranks tax RETURNS by AGI; CBO ranks HOUSEHOLDS by income before transfers
// and taxes, adjusted for household size. They are not the same ranking. We map
// each SOI AGI class by its midpoint onto CBO's own published 2022 group minimums
// (household size 2), and we say so on the chart.
var XWALK = (function () {
  var m = D.cbo.mins;
  // CBO band edges, lowest -> highest, plus the top-1% floor handled separately.
  var edges = [0, m.second, m.middle, m.fourth, m.highest, Infinity];
  var names = ['lowest', 'second', 'middle', 'fourth', 'highest'];
  return D.soi.c.map(function (c) {
    var lo = c[1], hi = c[2] === null ? Math.max(c[1] * 3, m.top1 * 2) : c[2];
    var span = hi - lo, w = {};
    names.forEach(function (n, i) {
      var a = Math.max(lo, edges[i]), b = Math.min(hi, edges[i + 1]);
      w[n] = b > a ? (b - a) / span : 0;
    });
    var t1a = Math.max(lo, m.top1), t1b = hi;
    w.top1 = t1b > t1a ? (t1b - t1a) / span : 0;
    return w;
  });
})();
function blankAlloc() { var a = {}; GROUPS.forEach(function (g) { a[g] = 0; }); return a; }
// Distribute a value across SOI classes using per-class weights, then fold onto CBO groups.
function allocFromSoi(weights) {
  var total = weights.reduce(function (s, w) { return s + w; }, 0);
  var a = blankAlloc();
  if (!total) return a;
  weights.forEach(function (w, i) {
    if (!w) return;
    var f = w / total, x = XWALK[i];
    GROUPS.forEach(function (g) { a[g] += f * (x[g] || 0); });
  });
  return a;
}
// Spread a residual across the bottom four quintiles by their share of income
// before transfers and taxes (CBO's own table).
function spreadResidual(a, residual) {
  var keys = ['lowest', 'second', 'middle', 'fourth'];
  var tot = keys.reduce(function (s, k) { return s + D.cbo.g[k].shrBefore; }, 0);
  keys.forEach(function (k) { a[k] += residual * D.cbo.g[k].shrBefore / tot; });
  return a;
}

/* ── the corporate-incidence allocation, backed out of two CBO tables ──── */
// CBO publishes the corporate tax's distribution under its OWN 25/75 labor/capital
// assumption, and separately publishes payroll-tax shares. Payroll shares are the
// available proxy for how labor income is distributed (imperfect: payroll tax is
// capped, so it understates labor income at the top). Solving
//   corpShare = 0.25 * laborShare + 0.75 * capitalShare
// recovers the capital-income allocation, which is what lets the dial actually move.
var CORP_ALLOC = (function () {
  var labor = {}, capital = {};
  GROUPS.forEach(function (g) {
    var cs = D.cbo.g[g].tShareCorp, ls = D.cbo.g[g].rPay ? null : null;
    labor[g] = D.cbo.g[g].tSharePayroll;
    capital[g] = (cs - 0.25 * labor[g]) / 0.75;
  });
  return { labor: labor, capital: capital };
})();


/* ── how much top-bracket income sits above a chosen dollar threshold ───── */
// The 37% bracket starts at $693,750 (married filing jointly, TY2023 — IRS Rev.
// Proc. 2022-38). A new bracket at, say, $10 million taxes only the income above
// $10 million, not everything already in the top bracket. Every threshold this
// tool offers ($500k / $1M / $2M / $5M / $10M) is an exact SOI class boundary, so
// no class straddles one and no within-class interpolation is needed.
function incomeAboveThreshold(c, T) {
  var inc = c[I37] / TH;                     // $B already taxed at 37%
  if (!T) return inc;                        // 'current' — the whole top bracket
  if (c[1] < T) return 0;                    // class sits entirely below the threshold
  var lift = Math.max(0, T - D.bracketStart.mfj);
  var out = inc - (c[3] * lift) / 1e9;       // returns x the dollars between the bracket start and T
  return out > 0 ? out : 0;
}

/* ═════════════════════════════ the model ═════════════════════════════════ */

function model(levers, assumptions) {
  var L = levers, A = assumptions;
  var components = [], unscored = [], why = [], guardViolations = [];

  /* ── Layer 2 setup: how broad is the base the user is simulating? ────── */
  var activeBroadeners = BROADENERS.filter(function (b) {
    if (b.id === 'stepUp') return L.stepUp !== 'current' || L.taxGainsAtDeath;
    if (b.id === 'health') return L.loopholes.health !== 'none';
    return !!L.loopholes[b.id];
  });
  var broadeningIndex = activeBroadeners.reduce(function (s, b) { return s + b.w; }, 0) / BROADENER_TOTAL;
  if (broadeningIndex > 1) broadeningIndex = 1;
  var etiBase = A.eti;
  var etiEff = A.holdEtiFixed ? etiBase : etiBase * (1 - (1 - ETI_BROAD_RATIO) * broadeningIndex);

  var cgElast = L.taxGainsAtDeath ? D.params.cg.lowRegime : D.params.cg.persistent;

  /* ══ Layer 1 + 2: ordinary top rate ═════════════════════════════════════ */
  var topRateChanged = L.topRate !== CUR_TOP || L.secondBracketRate !== null;
  if (topRateChanged) {
    var minLo = THRESH(L.topRateThreshold);
    var weights = [], staticA = 0, behavA = 0;
    D.soi.c.forEach(function (c, i) {
      var qualifies = c[1] >= minLo;
      var isSecond = L.secondBracketRate !== null && c[1] >= 10000000;
      var newRate = isSecond ? L.secondBracketRate : (qualifies ? L.topRate : CUR_TOP);
      var T = isSecond ? 10000000 : minLo;
      var inc = incomeAboveThreshold(c, T);        // $B of top-bracket income above T
      if (!inc || newRate === CUR_TOP) { weights.push(0); return; }
      var r0 = CUR_TOP / 100, r1 = newRate / 100;
      var st = inc * (r1 - r0);
      var dTI = etiEff * (Math.log(1 - r1) - Math.log(1 - r0)) * inc;
      var bh = r1 * dTI;
      staticA += st; behavA += bh;
      weights.push(Math.abs(st + bh));
    });
    var alloc = allocFromSoi(weights);
    components.push({
      id: 'topRate',
      label: L.secondBracketRate !== null
        ? 'Top rate ' + pct(L.topRate) + ' plus a new bracket at ' + pct(L.secondBracketRate) + ' above $10 million'
        : 'Top marginal rate ' + pct(CUR_TOP) + ' → ' + pct(L.topRate),
      static: staticA * YEARS, behavioral: behavA * YEARS, net: (staticA + behavA) * YEARS,
      alloc: alloc, allocTop1Known: true,
      window: 'annual TY2023 effect × 10, not uprated for income growth',
      baseline: 'post-obbba',
      source: 'Computed on IRS SOI Table 3.5 (TY2023) with an ETI of ' + etiEff.toFixed(2) + ' (Saez, Slemrod & Giertz range; Diamond & Saez base coupling)',
      url: D.params.eti.uSSG,
      isCut: L.topRate < CUR_TOP
    });
  }

  /* ══ Layer 1 + 2: capital gains, with its own elasticity regime ═════════ */
  var cgChanged = L.capGainsRate !== CUR_CG;
  if (cgChanged) {
    var cgBaseW = D.soi.c.map(function (c) { return c[I20] / TH; });
    var cgBase = cgBaseW.reduce(function (s, x) { return s + x; }, 0);
    var t0 = CUR_CG / 100, t1 = L.capGainsRate / 100;
    function cgNet(e) {
      var f = 1 + e * (t1 - t0) / t0;
      if (f < 0) f = 0;
      return (t1 * cgBase * f - t0 * cgBase) * YEARS;
    }
    var staticCg = (t1 - t0) * cgBase * YEARS;
    var netCg = cgNet(cgElast);
    var altCg = cgNet(L.taxGainsAtDeath ? D.params.cg.persistent : D.params.cg.lowRegime);
    components.push({
      id: 'capGains',
      label: 'Top capital-gains rate ' + pct(CUR_CG) + ' → ' + pct(L.capGainsRate) + ' (all-in, including the 3.8% net investment income tax)',
      static: staticCg, behavioral: netCg - staticCg, net: netCg,
      range: [Math.min(netCg, altCg), Math.max(netCg, altCg)],
      attributions: [
        { shop: 'Dowd, McClelland & Muthitacharoen (NTJ 2015)', value: cgNet(D.params.cg.persistent), note: 'persistent realization elasticity −0.72' },
        { shop: 'Agersnap & Zidar (NBER w27705)', value: cgNet(D.params.cg.lowRegime), note: 'the low-elasticity end of their −0.5 to −0.3 range' }
      ],
      alloc: allocFromSoi(cgBaseW), allocTop1Known: true,
      window: 'annual TY2023 effect × 10, not uprated for income growth',
      baseline: 'post-obbba',
      source: 'Computed on the top capital-gains band of IRS SOI Table 3.5 (TY2023) at a realization elasticity of ' + cgElast,
      url: D.params.cg.uPersistent,
      isCut: L.capGainsRate < CUR_CG
    });
  }

  /* ══ Step-up in basis (two variants, 2.7× apart) ════════════════════════ */
  if (L.stepUp !== 'current' || L.taxGainsAtDeath) {
    var atDeath = L.stepUp === 'atDeath' || L.taxGainsAtDeath;
    var sc = atDeath ? D.scores.tax_gains_at_death : D.scores.carryover_basis;
    var cgShare = D.shares.capgains;
    var aStep = blankAlloc();
    aStep.highest = cgShare.highest / 100; aStep.top1 = cgShare.top1 / 100;
    spreadResidual(aStep, 1 - cgShare.highest / 100);
    components.push({
      id: 'stepUp',
      label: atDeath ? 'Tax accrued capital gains at death' : 'Carryover basis for assets held until death',
      static: sc.v, behavioral: 0, net: sc.v,
      alloc: aStep, allocTop1Known: true,
      window: sc.w, baseline: sc.b, source: sc.s, url: sc.u, isCut: false,
      preScored: true
    });
  }

  /* ══ Corporate rate — static only; no sourced base elasticity exists ════ */
  if (L.corporateRate !== CUR_CORP) {
    var corpA = D.baseline.receipts.corporate * (L.corporateRate - CUR_CORP) / CUR_CORP;
    var aCorp = blankAlloc(), Lsh = A.corpLaborShare / 100, tot = 0;
    GROUPS.forEach(function (g) {
      if (g === 'top1') return;
      aCorp[g] = Lsh * CORP_ALLOC.labor[g] + (1 - Lsh) * CORP_ALLOC.capital[g];
      tot += aCorp[g];
    });
    aCorp.top1 = Lsh * CORP_ALLOC.labor.top1 + (1 - Lsh) * CORP_ALLOC.capital.top1;
    GROUPS.forEach(function (g) { aCorp[g] = aCorp[g] / tot; });
    components.push({
      id: 'corporate',
      label: 'Corporate rate ' + pct(CUR_CORP, 0) + ' → ' + pct(L.corporateRate, 0),
      static: corpA * YEARS, behavioral: 0, net: corpA * YEARS,
      alloc: aCorp, allocTop1Known: true,
      window: 'annual FY2025 receipts scaled linearly by the rate change, × 10',
      baseline: 'post-obbba',
      source: 'Derived from FY2025 corporate receipts of ' + usd(D.baseline.receipts.corporate) + ' at a 21% rate (OMB Table 08-1). Our arithmetic, not a published score.',
      url: D.baseline.receipts.u,
      noBehavioral: 'This dataset carries no published elasticity of the corporate tax base to the rate, so no second-layer offset is applied here. The corporate leg therefore reads as a conventional, static figure and the honest reading of it is an upper bound.',
      isCut: L.corporateRate < CUR_CORP
    });
  }

  /* ══ Payroll cap ════════════════════════════════════════════════════════ */
  if (L.payrollCap !== 'current') {
    if (L.payrollCap === 'eliminate') {
      var prov = L.payrollBenefitCredit
        ? D.payroll.ssa.filter(function (p) { return p.id === 'E2.2'; })[0]
        : D.payroll.ssa.filter(function (p) { return p.id === 'E2.1'; })[0];
      unscored.push({
        id: 'payrollEliminate',
        label: 'Eliminate the Social Security payroll cap' + (L.payrollBenefitCredit ? ' (with benefit credit)' : ' (no benefit credit)'),
        reason: 'No shop in this dataset publishes a ten-year dollar score for full elimination. SSA’s Office of the Chief Actuary scores it in percent of payroll instead: provision ' +
          prov.id + ' closes ' + prov.pct + '% of the 75-year Social Security shortfall (' + prov.payroll + '% of payroll). It is excluded from the revenue total rather than guessed at.',
        source: D.payroll.ssaSrc, url: D.payroll.ssaUrl
      });
    } else {
      var psc = L.payrollCap === 'donut250k' ? D.scores.payroll_donut250k : D.scores.payroll_90pct;
      var aPay = blankAlloc();
      aPay.highest = 1;   // CBO's 2022 highest-quintile floor for a 2-person household is $166,400
      components.push({
        id: 'payroll',
        label: L.payrollCap === 'donut250k'
          ? 'Apply the payroll tax to earnings above $250,000 (CBO’s scored “donut hole”)'
          : 'Raise the taxable share of earnings to 90%',
        static: psc.v, behavioral: 0, net: psc.v,
        alloc: aPay, allocTop1Known: false,
        window: psc.w, baseline: psc.b, source: psc.s, url: psc.u, isCut: false, preScored: true
      });
    }
  }

  /* ══ Loophole toggles (all pre-scored conventional estimates) ═══════════ */
  function preScored(id, label, sc, alloc, top1Known, extra) {
    var c = {
      id: id, label: label, static: sc.v, behavioral: 0, net: sc.v,
      alloc: alloc, allocTop1Known: !!top1Known,
      window: sc.w, baseline: sc.b, source: sc.s, url: sc.u, isCut: false, preScored: true
    };
    if (extra) for (var k in extra) c[k] = extra[k];
    components.push(c);
  }
  if (L.loopholes.s199a) {
    var a199 = blankAlloc();
    a199.highest = D.shares.s199a.topDecile / 100;
    spreadResidual(a199, 1 - D.shares.s199a.topDecile / 100);
    preScored('s199a', 'Repeal the Section 199A pass-through deduction', D.scores.repeal_199a, a199, false,
      { dynamic: D.scores.repeal_199a.dyn, allocNote: 'JCT publishes the top AGI DECILE’s share (87%, AGI at least $174,000). It does not publish a top-1% share, so the top-1% bar carries none of this component.' });
  }
  if (L.loopholes.health !== 'none') {
    var hsc = { p75: D.scores.health_p75, p50: D.scores.health_p50, p50inc: D.scores.health_p50_inc }[L.loopholes.health];
    var sh = D.shares.health, aH = blankAlloc();
    aH.highest = sh.highest / 100; aH.fourth = sh.fourth / 100; aH.middle = sh.middle / 100;
    var bt = sh.bottomTwo / 100, btTot = D.cbo.g.lowest.shrBefore + D.cbo.g.second.shrBefore;
    aH.lowest = bt * D.cbo.g.lowest.shrBefore / btTot;
    aH.second = bt * D.cbo.g.second.shrBefore / btTot;
    preScored('health', 'Cap the tax exclusion for employer health coverage', hsc, aH, false,
      { allocNote: 'This is the LEAST top-skewed of the large tax breaks — 44% to the top quintile, against 93% for the charitable deduction and 95% for preferential capital-gains rates. Any “tax breaks go to the rich” framing that lumps it in is inaccurate.' });
  }
  if (L.loopholes.salt) {
    preScored('salt', 'Eliminate the state and local tax deduction', D.scores.salt_eliminate, null, false,
      { allocNote: 'No distributional split for SALT alone appears in this dataset, so this component is excluded from the by-class chart rather than estimated.',
        vintageWarning: 'This is the weakest number on the board: a prior-vintage CBO alternative on a FY2023-2032 window and a pre-OBBBA baseline. OBBBA raised the SALT cap to $40,000 through 2029, which moves this figure materially in a direction nobody in this dataset has scored.' });
  }
  if (L.loopholes.mortgage) {
    var sm = D.shares.mortgage, aM = blankAlloc();
    aM.highest = sm.highest / 100; aM.top1 = sm.top1 / 100;
    spreadResidual(aM, 1 - sm.highest / 100);
    preScored('mortgage', 'Repeal the mortgage interest deduction', D.scores.repeal_mid, aM, true,
      { allocNote: 'CBO’s 2019 shares are on a $28 billion expenditure — TCJA’s larger standard deduction had collapsed itemisation that year. The share and the current-law dollar figure come from different years and different law.' });
  }
  if (L.loopholes.muniPA) {
    preScored('muniPA', 'End the tax exemption for new private-activity bonds', D.scores.muni_private, null, false,
      { allocNote: 'No distributional split in this dataset.',
        scopeWarning: 'PRIVATE ACTIVITY bonds only — a subset. CBO’s volume contains no option taxing new public-purpose municipal bonds, so the familiar “$30–40 billion a year of muni exemption” figure is not available here and is not shown.' });
  }
  if (L.loopholes.carriedInterest) {
    preScored('carriedInterest', 'Tax carried interest as ordinary income', D.scores.carried_interest, null, false,
      { allocNote: 'No distributional split in this dataset.',
        methodNote: 'The honest disagreement here is not between shops but within one: the same team scores the same proposal at ' +
          usd(D.scores.carried_interest.alt) + ' on its old methodology and ' + usd(D.scores.carried_interest.v) + ' on its new one. That methodological delta is the story.' });
  }
  if (L.loopholes.cryptoWash) {
    preScored('cryptoWash', 'Apply the wash-sale rule to digital assets', D.scores.crypto_wash, null, false,
      { allocNote: 'No distributional split in this dataset.',
        vintageWarning: 'A 2021-vintage JCT figure on a pre-OBBBA baseline. A 2026 secondary source references a larger number, which this project could not trace to a scorer and therefore does not use.' });
  }

  /* ══ Enforcement ════════════════════════════════════════════════════════ */
  var enfTotal = 0;
  if (L.enforcement !== 0) {
    var enf = L.enforcement > 0
      ? D.scores.irs_restore.v * L.enforcement / 100
      : D.scores.irs_rescind20b.v * Math.abs(L.enforcement) / 100;
    enfTotal = enf;
    components.push({
      id: 'enforcement',
      label: L.enforcement > 0
        ? 'Restore IRS enforcement capacity (' + L.enforcement + '% of the cuts already made)'
        : 'Cut IRS funding further (' + Math.abs(L.enforcement) + '% of a further $20 billion rescission)',
      static: 0, behavioral: 0, enforcement: enf, net: enf,
      alloc: null, allocTop1Known: false,
      window: L.enforcement > 0 ? D.scores.irs_restore.w : D.scores.irs_rescind20b.w,
      baseline: L.enforcement > 0 ? D.scores.irs_restore.b : D.scores.irs_rescind20b.b,
      source: L.enforcement > 0 ? D.scores.irs_restore.s : D.scores.irs_rescind20b.s,
      url: L.enforcement > 0 ? D.scores.irs_restore.u : D.scores.irs_rescind20b.u,
      isCut: false, preScored: true,
      linearityWarning: 'Scaled linearly between the endpoints. Return on enforcement spending falls as funding scales, so the top of this slider is the optimistic end of a contested estimate — and the widely-quoted ' +
        D.enforcement.auditRoiTop + ':1 return above the 90th income percentile excludes general deterrence across everyone else.',
      allocNote: 'No published split of recovered revenue by income group exists in this dataset, so enforcement is excluded from the by-class chart.'
    });
  }

  /* ══ System swaps ═══════════════════════════════════════════════════════ */
  if (L.system === 'flat') {
    var fStatic = 0, fBehav = 0, fW = [], fRate = L.flatRate / 100;
    var perClass = [];
    D.soi.c.forEach(function (c, i) {
      var ti = c[4] / TH, cur = c[5] / TH;
      if (ti <= 0) { fW.push(0); perClass.push(0); return; }
      var t0 = cur / ti, st = fRate * ti - cur;
      // A handful of the smallest AGI classes report tax generated that exceeds
      // 17-90% of their taxable income, because Form 8814 / Form 8615 items and
      // separately-rated capital gains sit in the tax column but barely in the
      // taxable-income column. An implied rate outside (0, 0.9) is a reporting
      // artefact, not a marginal rate, so no behavioural response is applied to it.
      var bh = 0;
      if (t0 > 0 && t0 < 0.9) {
        var dTI = etiEff * (Math.log(1 - fRate) - Math.log(1 - t0)) * ti;
        bh = fRate * dTI;
      }
      fStatic += st; fBehav += bh;
      fW.push(st + bh); perClass.push(st + bh);
    });
    // A flat tax moves burdens in BOTH directions, so a share-of-total allocation
    // would be meaningless. Allocate signed dollars directly.
    var aFlat = blankAlloc(), fTotal = fStatic + fBehav;
    perClass.forEach(function (v, i) {
      if (!fTotal) return;
      var f = v / fTotal, x = XWALK[i];
      GROUPS.forEach(function (g) { aFlat[g] += f * (x[g] || 0); });
    });
    components.push({
      id: 'system',
      label: 'Replace the rate schedule with a ' + pct(L.flatRate, 0) + ' flat tax on taxable income',
      static: fStatic * YEARS, behavioral: fBehav * YEARS, net: fTotal * YEARS,
      alloc: aFlat, allocTop1Known: true,
      window: 'annual TY2023 effect × 10, not uprated for income growth',
      baseline: 'post-obbba',
      source: 'Computed across all 24 AGI classes of IRS SOI Table 3.5 (TY2023). Rate-only: it keeps today’s deductions and exemptions rather than modelling a Hall–Rabushka family allowance.',
      url: 'https://www.irs.gov/pub/irs-soi/23in35tr.xls',
      compare: D.flatPublished,
      isCut: (fStatic + fBehav) < 0
    });
  } else if (L.system === 'fairtax') {
    var lo = -27700, hi = -9900;   // "roughly $9.9T to $27.7T over ten years", Brookings
    var chosen = L.fairtaxAssumption === 'high' ? lo : hi;
    components.push({
      id: 'system',
      label: 'Replace the income tax with the FairTax national sales tax at the legislated ' + D.fairtax.inclusive + '% tax-inclusive rate (a ' + D.fairtax.exclusive + '% markup at the register)',
      static: chosen, behavioral: 0, net: chosen, range: [lo, hi],
      attributions: [
        { shop: 'Brookings (Gale & Pomerleau, 2023) — low end', value: hi, note: 'before allowing for evasion or base erosion' },
        { shop: 'Brookings (Gale & Pomerleau, 2023) — high end', value: lo, note: 'allowing for evasion and base erosion' },
        { shop: 'Brookings — revenue-neutral rate instead', value: null, note: 'holding the deficit constant would require ' + D.fairtax.neutralInclusive + '% tax-inclusive, a ' + D.fairtax.neutralExclusive + '% markup at the register' }
      ],
      alloc: null, allocTop1Known: false,
      window: 'ten years', baseline: 'pre-obbba', source: D.fairtax.s, url: D.fairtax.u,
      isCut: true,
      distNote: 'The only published distribution for a national sales tax in this dataset is cut at the top quintile, so it cannot enter the by-class chart. What it shows: the bottom 80% of earners carry ' +
        D.fairtax.shareLower80Now + '% of federal income taxes today and would carry ' + D.fairtax.shareLower80Nrst + '% of a national sales tax — more than double. Modelled at a 22% rate in 2006 dollars.',
      steelman: 'The strongest defence of a consumption tax, in the Tax Policy Center’s own words: the burden of a sales tax is more proportional to income when measured over a lifetime rather than in a single year.'
    });
  } else if (L.system === 'vat5') {
    var vsc = L.vatBase === 'narrow' ? D.scores.vat_narrow : D.scores.vat_broad;
    preScored('system', 'Add a 5% value-added tax (' + (L.vatBase === 'narrow' ? 'narrower' : 'broad') + ' base)', vsc, null, false,
      { allocNote: 'This dataset carries no verified distributional table for a US VAT, so it is excluded from the by-class chart rather than assumed to be regressive or not.' });
  } else if (L.system === 'wealth') {
    var w = D.wealth;
    var pick = { saez_zucman: w.saez_zucman.v, pwbm: w.pwbm.v, summers_sarin: w.summers_sarin.annualLo * YEARS }[L.wealthScorer];
    var aW = blankAlloc(); aW.highest = 1; aW.top1 = 1;
    components.push({
      id: 'system',
      label: 'Add a wealth tax on the Warren design (2% above $50 million, 3% above $1 billion)',
      static: pick, behavioral: 0, net: pick,
      range: [w.summers_sarin.annualLo * YEARS, w.saez_zucman.v],
      attributions: [
        { shop: 'Saez & Zucman (2019)', value: w.saez_zucman.v, note: w.saez_zucman.w + '; about 75,000 households, less than 0.1%' },
        { shop: 'Penn Wharton Budget Model (2021)', value: w.pwbm.v, note: w.pwbm.w + ', conventional — on a matched window PWBM and Saez & Zucman land within about $30 billion of each other' },
        { shop: 'Summers & Sarin (2019)', value: w.summers_sarin.annualLo * YEARS, note: 'their published figure is ' + usd(w.summers_sarin.annualLo) + '–' + usd(w.summers_sarin.annualHi) + ' PER YEAR, which they explicitly call back-of-envelope and decline to turn into a ten-year total. Decadalising it is our arithmetic, shown only to put it on the same axis.' }
      ],
      alloc: aW, allocTop1Known: true,
      window: 'ten years', baseline: 'pre-obbba',
      source: 'Three shops, never averaged. The real disagreement is not a parameter — Saez & Zucman and Penn Wharton broadly agree on conventional scoring, while Summers & Sarin argue the exercise itself is unreliable.',
      url: w.saez_zucman.u, isCut: false, preScored: true,
      internationalNote: 'Norway raised its wealth-tax rate in 2022; by 2024 some 300 multimillionaires and billionaires had left for Switzerland AND revenue rose from 27 to an estimated 34 billion kroner. Both halves of that belong on the same line. Switzerland collects about 1% of GDP from its own net wealth tax.'
    });
  } else if (L.system === 'ftt') {
    preScored('system', 'Add a 0.1% financial transactions tax', D.scores.ftt, null, false,
      { allocNote: 'No distributional split in this dataset.',
        vintageWarning: 'Severely stale: a 2018 CBO option on a 2019-2028 window, and CBO dropped the financial transactions tax from its December 2024 volume entirely. There is no current-window equivalent, and market volumes have changed a great deal since. Partial pass-through to retirement accounts also makes the incidence less cleanly progressive than it looks.' });
  }

  /* ══ Totals ═════════════════════════════════════════════════════════════ */
  var tStatic = 0, tBehav = 0, tEnf = 0, tLo = 0, tHi = 0;
  components.forEach(function (c) {
    tStatic += c.static || 0; tBehav += c.behavioral || 0; tEnf += c.enforcement || 0;
    tLo += c.range ? c.range[0] : c.net;
    tHi += c.range ? c.range[1] : c.net;
  });
  var tNet = tStatic + tBehav + tEnf;

  /* ══ Guardrail: no rate cut may read as net-positive ════════════════════ */
  components.forEach(function (c) {
    if (c.isCut && c.net > 0) guardViolations.push(c.id + ' shows a rate cut raising revenue');
  });

  /* ══ Layer 2 output: the by-class chart ════════════════════════════════ */
  var dTax = blankAlloc(), allocated = 0, allocatedComponents = 0, top1Known = 0, top1Total = 0;
  components.forEach(function (c) {
    if (!c.alloc) return;
    allocatedComponents++;
    if (c.allocTop1Known) top1Known++;
    var annual = c.net / YEARS;
    GROUPS.forEach(function (g) { dTax[g] += (c.alloc[g] || 0) * annual; });
    allocated += Math.abs(annual);
  });
  components.forEach(function (c) { if (c.allocTop1Known) top1Total++; });
  var byClass = GROUPS.map(function (g) {
    var G = D.cbo.g[g];
    var incBefore = G.hh * G.incBefore / 1000;   // $B
    var incAfter = G.hh * G.incAfter / 1000;
    return {
      key: g, label: GROUP_LABEL[g],
      dTaxBn: dTax[g],
      dAvgRatePP: incBefore ? dTax[g] / incBefore * 100 : 0,
      dAfterTaxPct: incAfter ? -dTax[g] / incAfter * 100 : 0,
      currentAvgRate: G.rate,
      partial: g === 'top1' ? (top1Known < allocatedComponents) : false
    };
  });
  var coverage = {
    allocated: allocatedComponents,
    total: components.length,
    excluded: components.filter(function (c) { return !c.alloc; }).map(function (c) { return c.label; }),
    top1Excluded: components.filter(function (c) { return c.alloc && !c.allocTop1Known; }).map(function (c) { return c.label; })
  };

  /* ══ Layer 3: the GDP band. A range, always, and never fed back into revenue ══ */
  var demandLo = 0, demandHi = 0;
  GROUPS.forEach(function (g, i) {
    if (g === 'top1') return;                     // top 1% sits inside the highest quintile
    var idx = GROUPS.indexOf(g);
    var m = (g === 'highest') ? MULT.high : MULT.lowmid;
    var mLo = m[0], mHi = A.multiplierRegime === 'recession' ? m[1] : Math.min(m[1], RZ_CAP);
    var annualDelta = -dTax[g] / YEARS * YEARS;   // annual change in after-tax income, $B
    annualDelta = -dTax[g];
    var a = annualDelta * MPC_LO[idx] * mLo, b = annualDelta * MPC_HI[idx] * mHi;
    demandLo += Math.min(a, b); demandHi += Math.max(a, b);
  });
  var lens = LENS[A.lens];
  var staticAnnual = tStatic / YEARS;
  var sA = -staticAnnual * lens.lo * GDP_PER_DOLLAR[0];
  var sB = -staticAnnual * lens.hi * GDP_PER_DOLLAR[1];
  var sC = -staticAnnual * lens.lo * GDP_PER_DOLLAR[1];
  var sD = -staticAnnual * lens.hi * GDP_PER_DOLLAR[0];
  var supplyLo = Math.min(sA, sB, sC, sD), supplyHi = Math.max(sA, sB, sC, sD);
  var gdpDen = D.baseline.gdp.proj2026;
  var gdpLo = (demandLo + supplyLo) / gdpDen * 100;
  var gdpHi = (demandHi + supplyHi) / gdpDen * 100;
  if (gdpLo === gdpHi && gdpLo !== 0) gdpHi = gdpLo + 0.05;
  var gdp = {
    loPct: Math.round(gdpLo * 10) / 10, hiPct: Math.round(gdpHi * 10) / 10,
    lensLabel: lens.label, lensSource: lens.src, lensUrl: lens.url,
    regime: A.multiplierRegime, contested: true,
    citations: [
      { claim: 'Multipliers are larger in recessions', src: D.params.mult.supports.s, url: D.params.mult.supports.u },
      { claim: 'Multipliers are below unity irrespective of slack', src: D.params.mult.rejects.s, url: D.params.mult.rejects.u }
    ],
    notes: [
      'A band across the published range, not an estimate. Expressed as a share of CBO’s projected 2026 GDP of ' + usd(gdpDen) + ', to one decimal place — finer than that would be false precision.',
      'Macro feedback is never added back into the revenue figure above. That is a structural choice: it is what makes it impossible for any setting of this tool to show a tax cut financing itself.',
      'The demand leg covers only the components with a published distributional split. ' + (coverage.excluded.length ? coverage.excluded.length + ' component(s) are excluded from it.' : ''),
      'Converting a revenue-feedback share into a GDP effect uses CRFB’s published arithmetic that a policy would need to generate $5 to $6 of economic activity per $1 of cost before it broke even on revenue. The conversion is ours; the ratio is theirs.'
    ]
  };

  /* ══ Poverty proxy ══════════════════════════════════════════════════════ */
  var poverty = {
    annualBn: L.directToTransfers ? tNet / YEARS : 0,
    directed: !!L.directToTransfers,
    scored: false,
    note: 'This tool does not convert dollars into a poverty rate. There is no poverty elasticity anywhere in this dataset, and applying one to whatever the sliders happen to say would be inventing a parameter. Two scenario cards in Act 3 do carry poverty figures — the 2021 Child Tax Credit and universal housing vouchers — because someone else published them for that specific policy, and they are shown as that scorer’s number, not as this tool’s.',
    anchor: {
      label: 'What the record does show',
      text: 'The Supplemental Poverty Measure fell to a record low of 7.8% in 2021 — during a recession — on the strength of pandemic-era transfers, then rose to 12.4% in 2022 when they lapsed.',
      series: D.spm.data, source: D.spm.s, caveat: D.spm.caveat
    }
  };

  /* ══ Layer 4: the why-panel ════════════════════════════════════════════ */
  function W(id, title, chain, params, warnings, links) {
    // Gameplan §4 output 5: every panel ends with "Full methodology →". Adding it
    // here rather than in the renderer means no panel can ship without it,
    // whatever calls W.
    var ls = (links || []).slice();
    ls.push({ text: 'Full methodology →', url: METHODOLOGY_URL });
    why.push({ id: id, title: title, chain: chain, params: params || [], warnings: warnings || [], links: ls });
  }
  var lafferPeak = null;
  if (topRateChanged) {
    var c = components.filter(function (x) { return x.id === 'topRate'; })[0];
    var offset = c.static ? Math.abs(c.behavioral / c.static) * 100 : 0;
    var chain = [
      'You set the top marginal rate to ' + pct(L.topRate) + ', applying to ' + THRESH_LABEL(L.topRateThreshold) + '.',
      'On the IRS’s own TY2023 return data, the income that would face the new rate is ' +
        usd(D.soi.c.reduce(function (s, cc) { return s + incomeAboveThreshold(cc, THRESH(L.topRateThreshold)); }, 0)) +
        ' a year' + (THRESH(L.topRateThreshold) ? ' — income above your threshold, not everything already in the top bracket, which starts at $' + D.bracketStart.mfj.toLocaleString('en-US') + ' for a joint return' : '') +
        '. Applying the new rate to it gives a paper figure of ' + usd(c.static) + ' over ten years.',
      'High earners respond — shifting pay into capital gains, timing when income is realised, using deductions. At an elasticity of taxable income of ' +
        etiEff.toFixed(2) + ', about ' + offset.toFixed(0) + '% of that paper gain disappears, leaving ' + usd(c.net) + '.',
      'Most income at the very top is capital gains, which this lever does not touch. That is why the yield is smaller than the headline rate suggests — try pairing it with the capital-gains lever and “tax gains at death”.'
    ];
    if (L.topRate > CUR_TOP) {
      var pk = lafferPeakFederal(etiEff);
      lafferPeak = pk;
      chain.push('At this elasticity, revenue from this band stops rising at about ' + pct(pk, 0) +
        ' and falls above it. Diamond & Saez’s own formula puts the revenue-maximising rate at ' + pct(100 / (1 + D.params.tauStar.a * etiEff), 0) +
        ' — but theirs is an ALL-IN combined rate across federal, state, payroll and sales taxes, against a US combined top rate of 42.5%. It is not a federal bracket. Badel, Huggett & Luo reach about 49% in a model with human-capital effects the standard formula leaves out.');
      if (L.topRateThreshold === '10m' && L.topRate >= 65 && L.topRate <= 75) {
        var bm = D.benchmarks.seventy.estimates.filter(function (e) { return /Ordinary income only/.test(e.scenario || ''); });
        chain.push('A published check on this setting: Tax Foundation scored a 70% rate above $10 million at ' + usd(291.7) +
          ' conventional and ' + usd(189.1) + ' dynamic over 2019-2028, and Penn Wharton at ' + usd(382.3) +
          ' static over 2020-2029. This engine lands at ' + usd(c.net) + ' — the same order of magnitude, from a different base year and a different method.');
        chain.push('Watch what happens when the 70% rate also covers capital gains: Tax Foundation’s conventional score falls from ' + usd(291.7) + ' to ' + usd(51.4) +
          ' and its dynamic score goes NEGATIVE, at ' + usd(-63.5) + '. Realisations collapse. That single comparison is the realization doctrine in one line.');
      }
      chain.push('Revenue-maximising is not the same as best. Where the top rate should sit is a judgement about how much a dollar is worth to a rich household versus a poor one, which no model settles.');
    }
    W('topRate', 'The top marginal rate', chain,
      ['ETI ' + etiEff.toFixed(2) + (broadeningIndex > 0 && !A.holdEtiFixed ? ' (your selected ' + etiBase.toFixed(2) + ', scaled down because you also broadened the base)' : ''),
       'Base: IRS SOI Table 3.5, TY2023', 'Ten-year figures are the annual effect × 10, not uprated for income growth'],
      A.holdEtiFixed && broadeningIndex > 0
        ? ['You are holding the elasticity of taxable income fixed while closing ' + activeBroadeners.length + ' loophole(s). The authors of the elasticity literature say that is wrong: Saez, Slemrod and Giertz write that “the ETI can be thought of as a policy choice”, and Diamond and Saez that the avoidance component “is not an immutable parameter and can be reduced through base broadening and tax enforcement”. Held fixed, this figure understates what a broadened base would actually raise.']
        : [],
      [{ text: 'Saez, Slemrod & Giertz, JEL 2012', url: D.params.eti.uSSG }, { text: 'Diamond & Saez, JEP 2011', url: D.params.tauStar.u }]);
  }
  if (cgChanged) {
    var cg = components.filter(function (x) { return x.id === 'capGains'; })[0];
    var ch = [
      'You set the top capital-gains rate to ' + pct(L.capGainsRate) + ' all-in.',
      'Capital gains are the one tax people can simply decline to trigger: you owe nothing until you sell. Raising the rate makes selling less attractive, so realisations fall.',
      'At a realization elasticity of ' + cgElast + ', the paper figure of ' + usd(cg.static) + ' over ten years becomes ' + usd(cg.net) + '.'
    ];
    if (!L.taxGainsAtDeath) {
      ch.push('And the escape hatch is still open. Assets held until death get their basis stepped up, so the gain is never taxed at all — which is exactly why a rate rise on its own does so little. Turn on “tax gains at death” and watch this number change sign.');
    } else {
      ch.push('Because you also tax gains at death, the lock-in incentive weakens: there is no longer a reason to hold an asset forever. Sarin, Summers, Zidar and Zwick put it directly — eliminating stepped-up basis “will decrease the elasticity of the tax base to rate changes”, and they add roughly ' +
        usd(D.params.cg.stepUpExtra) + ' over a decade to a rate rise combined with that change. The engine switches to the low-elasticity regime here for that reason.');
    }
    ch.push('The published spread on this lever is 3–5×, driven entirely by this one parameter. Penn Wharton scores a roughly 4-point rise at about $66 billion over ten years; Agersnap and Zidar’s numbers imply $180–300 billion. There is no consensus figure, which is why this lever shows a range.');
    W('capGains', 'Capital gains and the realization doctrine', ch,
      ['Realization elasticity ' + cgElast + (L.taxGainsAtDeath ? ' (low-elasticity regime, because gains are taxed at death)' : ' (persistent estimate, Dowd/McClelland/Muthitacharoen 2015)'),
       'Base: the top capital-gains band of IRS SOI Table 3.5, TY2023 — gains in the 15% band are untouched, which makes this conservative'],
      L.capGainsRate > 30 && !L.taxGainsAtDeath
        ? ['Above roughly ' + pct(cgRevMax(D.params.cg.persistent), 0) + ', this lever raises less than it did at a lower rate. The scorekeeping community has generally put the revenue-maximising capital-gains rate near ' + D.params.cg.scorekeeper + '%; Agersnap and Zidar’s long-run estimates are ' + D.params.cg.azRevMax[0] + '–' + D.params.cg.azRevMax[1] + '%; a CRS analysis reaches 65% on its own assumptions. The spread is the finding.']
        : [],
      [{ text: 'Dowd, McClelland & Muthitacharoen, National Tax Journal 2015', url: D.params.cg.uPersistent },
       { text: 'Sarin, Summers, Zidar & Zwick on scoring capital gains', url: D.params.cg.uStepUp }]);
  }
  if (L.corporateRate !== CUR_CORP) {
    var cc = components.filter(function (x) { return x.id === 'corporate'; })[0];
    W('corporate', 'The corporate rate — and who actually pays it',
      ['You set the corporate rate to ' + pct(L.corporateRate, 0) + ', against 21% under current law.',
       'Scaling FY2025 corporate receipts of ' + usd(D.baseline.receipts.corporate) + ' linearly by the rate change gives ' + usd(cc.net) + ' over ten years. That is our arithmetic on OMB’s actuals, not a published score.',
       'Who bears it is the widest disagreement in this entire dataset. Treasury puts 18% on labor; JCT and CBO 25%; the Tax Policy Center 20%; the Tax Foundation 70% or more. That is roughly a four-fold range on a first-order question, and your dial is currently at ' + A.corpLaborShare + '%.',
       'Sliding that dial is really sliding an assumption about how much corporate income is economic rent rather than a normal return on capital. Treasury’s 82% capital share decomposes into 63% supernormal return and 18% normal return, and that decomposition is the substantive claim.'],
      ['Labor share of the corporate tax: ' + A.corpLaborShare + '%',
       'Distributional split derived from CBO’s published corporate and payroll tax shares — payroll shares stand in for how labor income is distributed, which understates the top because the payroll tax is capped'],
      [cc.noBehavioral],
      D.params.incidence.shops.map(function (s) { return { text: s.shop + ': ' + s.labor + '% on labor', url: s.u }; }));
  }
  if (L.payrollCap !== 'current') {
    if (L.payrollCap === 'eliminate') {
      var pv = L.payrollBenefitCredit ? 'E2.2' : 'E2.1';
      var pr = D.payroll.ssa.filter(function (p) { return p.id === pv; })[0];
      W('payroll', 'Scrapping the payroll cap — and the design choice nobody discusses',
        ['You eliminated the Social Security wage cap, which is $' + D.payroll.cap2026.toLocaleString('en-US') + ' in 2026.',
         'Whether the new earnings also earn benefits changes the answer enormously. SSA’s Office of the Chief Actuary scores elimination WITHOUT benefit credit (provision E2.1) at closing 67% of the 75-year shortfall, and WITH benefit credit (provision E2.2) at 48%. You have selected ' + pv + ': ' + pr.pct + '%.',
         'The familiar “it closes half to two-thirds of the gap” is not uncertainty about the world. It is two different policies, and which one people mean is almost never stated.',
         'No shop in this dataset publishes a ten-year dollar figure for full elimination, so this lever contributes nothing to the revenue bar above rather than a guess. CBO does score a “donut hole” — but at a $250,000 threshold, not the $400,000 usually quoted.'],
        ['SSA provision ' + pr.id + ' (' + pr.payroll + '% of payroll, 2025 Trustees Report basis)'],
        ['Excluded from the revenue total: no published ten-year dollar score exists for this variant.'],
        [{ text: 'SSA Office of the Chief Actuary, provisions summary', url: D.payroll.ssaUrl }]);
    } else {
      W('payroll', 'Raising the payroll cap',
        ['You applied the payroll tax further up the earnings distribution.',
         'CBO scores this at ' + usd(components.filter(function (x) { return x.id === 'payroll'; })[0].net) + ' over ' + D.scores.payroll_donut250k.w + ', net of an offset for the income and payroll taxes it displaces.',
         'The payroll tax is the largest federal tax most households pay, and it stops applying above the cap. That is the mechanism that makes it regressive at the top: in 2022 the lowest quintile paid 9.5% of its income in payroll tax while the top 1% paid 2.0%.'],
        ['CBO Budget Option 60955, pre-OBBBA baseline'], [],
        [{ text: 'CBO Budget Option 60955', url: D.scores.payroll_donut250k.u }]);
    }
  }
  components.filter(function (c) { return c.preScored && ['s199a', 'health', 'salt', 'mortgage', 'muniPA', 'carriedInterest', 'cryptoWash', 'stepUp'].indexOf(c.id) > -1; })
    .forEach(function (c) {
      var ch = [
        'You turned on: ' + c.label + '.',
        'This is a published conventional score of ' + usd(c.net) + ' over ' + c.window + ', from ' + c.source.split(' — ')[0] + '.',
        'It already nets out that scorer’s own behavioural assumptions, so this engine does not apply a second offset on top of it — that would be double-counting.'
      ];
      if (c.baseline === 'pre-obbba') ch.push('Read it against a PRE-OBBBA baseline. The One Big Beautiful Bill Act made the TCJA individual provisions permanent in July 2025, and most revenue-raisers would score higher against the law as it now stands.');
      if (c.allocNote) ch.push(c.allocNote);
      if (c.methodNote) ch.push(c.methodNote);
      if (c.id === 'stepUp') ch.push('The two variants are 2.7× apart for a reason worth sitting with: repealing stepped-up basis WITHOUT taxing gains at death raises ' + usd(D.scores.carryover_basis.v) + ', because heirs simply keep deferring. Taxing at death raises ' + usd(D.scores.tax_gains_at_death.v) + '. Same loophole, same name, and the difference is entirely whether the escape hatch closes.');
      var warn = [];
      if (c.vintageWarning) warn.push(c.vintageWarning);
      if (c.scopeWarning) warn.push(c.scopeWarning);
      W(c.id, c.label, ch, [c.window + ' · ' + (c.baseline === 'pre-obbba' ? 'pre-OBBBA baseline' : 'post-OBBBA baseline')], warn, [{ text: c.source.split(' — ')[0], url: c.url }]);
    });
  if (L.enforcement !== 0) {
    var ec = components.filter(function (x) { return x.id === 'enforcement'; })[0];
    W('enforcement', 'Enforcement — the one lever where a dollar in returns more than a dollar',
      ['You moved IRS enforcement capacity to ' + (L.enforcement > 0 ? '+' : '') + L.enforcement + '% of the change already enacted.',
       'The Budget Lab at Yale puts the revenue lost to the staffing and budget cuts already made at just over ' + usd(D.scores.irs_restore.v) + ' over 2026-2035. CBO separately finds that a $20 billion rescission reduces revenues by $44 billion — and raises the deficit by $24 billion, not $44 billion, because the rescission itself saves $20 billion of outlays.',
       'Why enforcement works at all is the most teachable table in this dataset, and it has nothing to do with who is honest. Where income is reported by a third party and withheld — wages — the misreporting rate is 1%. Where there is little or no information reporting, such as sole-proprietor income, it is 55%. Visibility, not virtue.',
       'The gross tax gap for TY2022 is ' + usd(D.enforcement.taxGapGross) + '; net of late payments, ' + usd(D.enforcement.taxGapNet) + '.'],
      ['Scaled linearly from the published endpoints'],
      [ec.linearityWarning, 'This is the only near-free-lunch item in the tool. That is exactly why the contested caveat is attached: a tool that shows one free lunch without a caveat has undermined itself on everything else.'],
      [{ text: 'Boning, Hendren, Sprung-Keyser & Stuart, NBER w31376', url: D.enforcement.auditUrl },
       { text: 'IRS tax gap projections, TY2022', url: D.enforcement.taxGapUrl }]);
  }
  if (L.system !== 'current') {
    var sc2 = components.filter(function (x) { return x.id === 'system'; })[0];
    var ch2 = [], warn2 = [];
    if (L.system === 'flat') {
      var lowest = byClass.filter(function (b) { return b.key === 'lowest'; })[0];
      var top1b = byClass.filter(function (b) { return b.key === 'top1'; })[0];
      ch2 = ['You replaced the rate schedule with a single ' + pct(L.flatRate, 0) + ' rate on taxable income.',
        'Across all 24 AGI classes in IRS SOI Table 3.5, that is ' + usd(sc2.net) + ' over ten years. The average rate actually collected on taxable income today is about ' +
          pct(D.soi.c.reduce(function (s, c) { return s + c[5]; }, 0) / D.soi.c.reduce(function (s, c) { return s + c[4]; }, 0) * 100),
        'Look at the class chart, not the total. A flat rate is above what most lower-income filers pay today and far below what the top pays, so it moves burden down the distribution: the lowest quintile’s average federal rate changes by ' +
          lowest.dAvgRatePP.toFixed(2) + ' points while the top 1%’s changes by ' + top1b.dAvgRatePP.toFixed(2) + '.',
        'This is a rate-only simulation. A real flat tax redesigns the base too — Hall–Rabushka pairs its rate with a large family allowance, and the Cruz plan the Tax Policy Center scored paired a 10% individual rate with a 16% business tax that was a value-added tax in substance.'];
      warn2.push('The published comparison in this dataset — the Tax Policy Center’s ' + usd(D.flatPublished.v) + ' over ' + D.flatPublished.w + ' — is on a pre-TCJA AND pre-OBBBA baseline, and it scores a package rather than a bare rate change. It is a direction check, not a benchmark our number should match.');
    } else if (L.system === 'fairtax') {
      ch2 = ['You replaced the income tax with a national sales tax at the rate written into the bill.',
        'The rate framing is itself contested and both numbers are correct: ' + D.fairtax.inclusive + '% "tax-inclusive" is the tax as a share of the total after-tax price; the same tax is a ' + D.fairtax.exclusive + '% markup at the register.',
        'At the legislated rate the policy does not pay for the government it replaces. Brookings puts the ten-year deficit impact at ' + D.fairtax.deficitAt23 + '.',
        'Holding the deficit constant instead needs ' + D.fairtax.neutralInclusive + '% tax-inclusive — a ' + D.fairtax.neutralExclusive + '% markup — once evasion and avoidance are allowed for.',
        sc2.distNote, sc2.steelman];
    } else if (L.system === 'wealth') {
      ch2 = ['You added a wealth tax on the Warren design.',
        'Three published estimates, shown separately because averaging them would hide the actual disagreement: Saez and Zucman ' + usd(D.wealth.saez_zucman.v) + '; Penn Wharton ' + usd(D.wealth.pwbm.v) + ' on a matched window; Summers and Sarin ' + usd(D.wealth.summers_sarin.annualLo) + '–' + usd(D.wealth.summers_sarin.annualHi) + ' a year, which they call back-of-envelope.',
        'The honest framing is not “shops disagree by a factor of three.” Saez-Zucman and Penn Wharton broadly agree on conventional scoring. Summers and Sarin dispute whether the exercise can be done reliably at all. That is a disagreement about method confidence, not about a parameter.',
        sc2.internationalNote];
    } else if (L.system === 'vat5') {
      ch2 = ['You added a 5% value-added tax on a ' + (L.vatBase === 'narrow' ? 'narrower' : 'broad') + ' base.',
        'CBO scores it at ' + usd(sc2.net) + ' over ' + sc2.window + '. The base choice matters more than the rate: the broad base raises ' + usd(D.scores.vat_broad.v) + ' and the narrower one ' + usd(D.scores.vat_narrow.v) + ' — the difference is food, health care, new housing and postsecondary education.',
        sc2.allocNote];
    } else if (L.system === 'ftt') {
      ch2 = ['You added a 0.1% tax on financial transactions.',
        'CBO scored this at ' + usd(sc2.net) + ' over ' + sc2.window + '.', sc2.allocNote];
      warn2.push(sc2.vintageWarning);
    }
    if (sc2.vintageWarning && warn2.indexOf(sc2.vintageWarning) === -1) warn2.push(sc2.vintageWarning);
    W('system', sc2.label, ch2, [sc2.window + ' · ' + (sc2.baseline === 'pre-obbba' ? 'pre-OBBBA baseline' : 'post-OBBBA baseline')], warn2,
      [{ text: sc2.source.split(' — ')[0], url: sc2.url }]);
  }
  if (broadeningIndex > 0 && !A.holdEtiFixed) {
    W('etiCoupling', 'Why the elasticity moved when you closed a loophole',
      ['You have closed ' + activeBroadeners.length + ' base-narrowing provision(s), which is ' + pct(broadeningIndex * 100, 0) + ' of everything this tool can close.',
       'So the engine lowered the elasticity of taxable income from ' + etiBase.toFixed(2) + ' to ' + etiEff.toFixed(2) + '. That is not a tweak: the elasticity is not a fact about people, it is a fact about the tax code they are facing.',
       'Diamond and Saez put numbers on it for the same population in the same year — 0.57 on the current taxable-income base against 0.17 on a broad one, a 3.4-fold difference that comes entirely from how the base is defined.',
       'The practical consequence: rate increases and base broadening are complements, not substitutes. Closing loopholes makes a rate increase raise more, because there is less room to move income out of reach.'],
      ['Coupling anchored to Diamond & Saez’s own 0.57 / 0.17 pair; weights are each provision’s published on-paper size'],
      [], [{ text: 'Diamond & Saez, JEP 2011', url: D.params.eti.uDS }]);
  }

  /* ══ Diagnostics ════════════════════════════════════════════════════════ */
  function lafferPeakFederal(e) {
    var best = CUR_TOP, bestV = -Infinity;
    for (var r = 37.5; r <= 99; r += 0.1) {
      var r1 = r / 100, r0 = CUR_TOP / 100;
      var v = r1 * (1 + e * (Math.log(1 - r1) - Math.log(1 - r0)));
      if (v > bestV) { bestV = v; best = r; }
    }
    return Math.round(best * 10) / 10;
  }
  function cgRevMax(e) { return CUR_CG * (1 - 1 / e) / 2; }

  return {
    revenue: {
      tenYear: { static: tStatic, behavioral: tBehav, enforcement: tEnf, net: tNet, lo: tLo, hi: tHi },
      annual: { net: tNet / YEARS },
      components: components
    },
    unscored: unscored,
    byClass: byClass,
    coverage: coverage,
    gdp: gdp,
    poverty: poverty,
    why: why,
    diagnostics: {
      etiBase: etiBase, etiEffective: etiEff, broadeningIndex: broadeningIndex,
      cgElasticity: cgElast,
      lafferPeakFederalPct: lafferPeakFederal(etiEff),
      tauStarCombinedPct: 100 / (1 + D.params.tauStar.a * etiEff),
      tauStarLabel: 'Diamond & Saez’s revenue-maximising rate is an ALL-IN COMBINED rate — federal, state, payroll and sales taxes together, against a US combined top rate of 42.5% — not a federal bracket.',
      cgRevMaxPersistent: cgRevMax(D.params.cg.persistent),
      activeBroadeners: activeBroadeners.map(function (b) { return b.id; })
    },
    guards: { selfFinancingViolation: guardViolations.length > 0, violations: guardViolations }
  };
}

return { model: model, CURRENT_LAW: CURRENT_LAW, DEFAULT_ASSUMPTIONS: DEFAULT_ASSUMPTIONS, clone: clone, D: D, GROUPS: GROUPS, GROUP_LABEL: GROUP_LABEL, usd: usd, pct: pct };
}));
