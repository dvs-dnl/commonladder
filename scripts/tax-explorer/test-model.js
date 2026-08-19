#!/usr/bin/env node
/**
 * test-model.js — headless unit tests for the Tax Ladder Act 2 engine.
 *
 * Gameplan §9 "Model" checklist, all nine cases, plus five extra invariants that
 * Phase 0's findings made load-bearing (ETI/base coupling, the never-claim list,
 * unscored-item accounting, payroll-cap variant labelling, GDP band width).
 *
 * These were written BEFORE the engine, and before any Act 2 UI work, so that a
 * wrong engine fails mechanically rather than by eyeballing a chart.
 *
 * Run:  node scripts/tax-explorer/test-model.js
 * Exit: 0 = all pass, 1 = any failure.
 *
 * NOT SHIPPED. This file and act2-data.json are build-time artefacts; only
 * learn/tax-explorer/index.html goes to the live site.
 */
'use strict';
const path = require('path');
const { model, CURRENT_LAW, DEFAULT_ASSUMPTIONS, clone } = require('./model.js');

let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push(['PASS', name, '']); }
  catch (e) { fail++; results.push(['FAIL', name, e.message]); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg} (got ${a}, expected ~${b} ±${tol})`); }
function L(over) { return Object.assign(clone(CURRENT_LAW), over || {}); }
function A(over) { return Object.assign(clone(DEFAULT_ASSUMPTIONS), over || {}); }
const note = [];

/* ───────────────────────────── 1. Baseline reproduction ───────────────── */
t('1. Current law reproduces the baseline: every output is zero', () => {
  const r = model(clone(CURRENT_LAW), clone(DEFAULT_ASSUMPTIONS));
  near(r.revenue.tenYear.net, 0, 1e-9, 'net revenue');
  near(r.revenue.tenYear.static, 0, 1e-9, 'static revenue');
  near(r.revenue.tenYear.behavioral, 0, 1e-9, 'behavioral offset');
  near(r.revenue.tenYear.enforcement, 0, 1e-9, 'enforcement');
  r.byClass.forEach(g => {
    near(g.dTaxBn, 0, 1e-9, `class ${g.key} tax change`);
    near(g.dAvgRatePP, 0, 1e-9, `class ${g.key} avg rate change`);
    near(g.dAfterTaxPct, 0, 1e-9, `class ${g.key} after-tax income change`);
  });
  near(r.gdp.loPct, 0, 1e-9, 'GDP band low');
  near(r.gdp.hiPct, 0, 1e-9, 'GDP band high');
  ok(r.revenue.components.length === 0, 'no components should be active at current law');
  ok(r.guards.selfFinancingViolation === false, 'no guard violation at baseline');
});

/* ───────────── 2. Top rate 37 → 39.6: sign, magnitude, offset share ────── */
t('2. Top rate 37→39.6% lands in the right ballpark with a 10–40% behavioral offset', () => {
  const r = model(L({ topRate: 39.6 }), A());
  const c = r.revenue.components.find(x => x.id === 'topRate');
  ok(c, 'topRate component missing');
  ok(c.net > 0, 'a top-rate increase must raise revenue at consensus ETI');
  const offsetShare = Math.abs(c.behavioral) / Math.abs(c.static);
  ok(offsetShare > 0.10 && offsetShare < 0.40, `behavioral offset ${(offsetShare * 100).toFixed(1)}% outside 10–40%`);
  // Sanity band, not an exact match: no shop publishes a top-BRACKET-ONLY score.
  // CBO's nearest is the top FOUR brackets at +2pp ($569.5B); Tax Foundation's is
  // +2.6pp bundled with a threshold cut ($409.0B conventional). Ours covers less
  // base than either and is not uprated for income growth, so it must land BELOW
  // both while staying the same order of magnitude.
  ok(c.net > 100 && c.net < 409.0, `net ${c.net.toFixed(1)}B/10yr should sit below the Tax Foundation benchmark and above $100B`);
  note.push(`  test 2: static ${c.static.toFixed(1)}B, behavioral ${c.behavioral.toFixed(1)}B, net ${c.net.toFixed(1)}B per 10 years (offset ${(offsetShare * 100).toFixed(1)}%)`);
});

/* ─────────────────────── 3. Laffer curvature and the peak ──────────────── */
t('3. Revenue rolls over: 95% is past the peak, and the peak sits in a plausible band', () => {
  const at = rate => model(L({ topRate: rate }), A()).revenue.tenYear.net;
  const r50 = at(50), r95 = at(95);
  const peak = model(L({ topRate: 50 }), A()).diagnostics.lafferPeakFederalPct;
  ok(peak > 50 && peak < 90, `federal-bracket peak ${peak}% outside 50–90%`);
  ok(at(peak) > r95, 'revenue at 95% must be below revenue at the peak');
  ok(at(peak) >= r50, 'revenue at the peak must be at least revenue at 50%');
  // monotone up to the peak, monotone down after it
  for (let x = 38; x < peak - 1; x += 2) ok(at(x + 2) > at(x), `revenue should still be rising at ${x}%`);
  for (let x = Math.ceil(peak) + 1; x < 95; x += 2) ok(at(x + 2) < at(x), `revenue should be falling at ${x}%`);
  // The dial must move the peak, and the Diamond–Saez combined tau* must be labelled as combined.
  const peakHi = model(L({ topRate: 50 }), A({ eti: 0.57 })).diagnostics.lafferPeakFederalPct;
  const peakLo = model(L({ topRate: 50 }), A({ eti: 0.12 })).diagnostics.lafferPeakFederalPct;
  ok(peakHi < peak && peak < peakLo, 'a higher ETI must lower the revenue-maximising rate');
  const d = model(L({ topRate: 50 }), A()).diagnostics;
  near(d.tauStarCombinedPct, 100 / (1 + 1.5 * d.etiEffective), 0.01, 'Diamond–Saez tau* formula');
  ok(/combined/i.test(d.tauStarLabel), 'tau* must be labelled as an all-in COMBINED rate');
  note.push(`  test 3: federal peak ${peak.toFixed(1)}% at ETI 0.25 (${peakHi.toFixed(1)}% at 0.57, ${peakLo.toFixed(1)}% at 0.12); D&S combined tau* ${d.tauStarCombinedPct.toFixed(1)}%`);
});

/* ────────── 4. Capital gains: the two paths must diverge in SIGN ───────── */
t('4. Capital gains 23.8→39.6%: without tax-at-death vs with it diverge in SIGN', () => {
  const without = model(L({ capGainsRate: 39.6 }), A());
  const withDeath = model(L({ capGainsRate: 39.6, taxGainsAtDeath: true }), A());
  const cW = without.revenue.components.find(x => x.id === 'capGains');
  const cD = withDeath.revenue.components.find(x => x.id === 'capGains');
  ok(cW.net <= 0, `without tax-at-death the net must be zero or negative, got ${cW.net.toFixed(1)}B`);
  ok(withDeath.revenue.tenYear.net > 0, 'with tax-at-death the package must be strongly positive');
  ok(Math.sign(cW.net) !== Math.sign(cD.net), 'the two capital-gains paths must differ in sign');
  ok(without.diagnostics.cgElasticity === -0.72, 'default realization elasticity must be the NTJ 2015 persistent -0.72');
  ok(withDeath.diagnostics.cgElasticity === -0.30, 'tax-at-death must switch to the low-elasticity regime (-0.30)');
  ok(withDeath.diagnostics.cgElasticity !== without.diagnostics.cgElasticity, 'the elasticity regime must actually change');
  note.push(`  test 4: without tax-at-death ${cW.net.toFixed(1)}B; with it, capital-gains leg ${cD.net.toFixed(1)}B and package ${withDeath.revenue.tenYear.net.toFixed(1)}B per 10 years`);
});

/* ─────────────────── 5. Flat tax: loss + regressive class chart ────────── */
t('5. A 17% flat tax loses large revenue AND shifts burden down the distribution', () => {
  const r = model(L({ system: 'flat', flatRate: 17 }), A());
  ok(r.revenue.tenYear.net < -1000, `flat tax should lose more than $1T per 10 years, got ${r.revenue.tenYear.net.toFixed(0)}B`);
  const g = k => r.byClass.find(x => x.key === k);
  ok(g('lowest').dAvgRatePP > 0, 'the lowest quintile must pay a HIGHER average rate under a flat tax');
  ok(g('top1').dAvgRatePP < 0, 'the top 1% must pay a LOWER average rate under a flat tax');
  ok(g('top1').dAfterTaxPct > g('lowest').dAfterTaxPct, 'the top 1% must gain more after-tax income than the lowest quintile');
  ok(g('top1').dAfterTaxPct > g('middle').dAfterTaxPct, 'the top 1% must gain more than the middle quintile');
  note.push(`  test 5: ${r.revenue.tenYear.net.toFixed(0)}B/10yr; after-tax income lowest ${g('lowest').dAfterTaxPct.toFixed(2)}%, middle ${g('middle').dAfterTaxPct.toFixed(2)}%, top 1% ${g('top1').dAfterTaxPct.toFixed(2)}%`);
});

/* ── 6. Every pre-scored figure the engine emits matches data/ exactly ──── */
t('6. Pre-scored components reproduce their data/ value exactly, with window + baseline', () => {
  const D = require('./act2-data.json');
  const cases = [
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { s199a: true }) }), 's199a', D.scores.repeal_199a.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { mortgage: true }) }), 'mortgage', D.scores.repeal_mid.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { muniPA: true }) }), 'muniPA', D.scores.muni_private.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { carriedInterest: true }) }), 'carriedInterest', D.scores.carried_interest.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { cryptoWash: true }) }), 'cryptoWash', D.scores.crypto_wash.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { health: 'p75' }) }), 'health', D.scores.health_p75.v],
    [L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { salt: true }) }), 'salt', D.scores.salt_eliminate.v],
    [L({ payrollCap: 'donut250k' }), 'payroll', D.scores.payroll_donut250k.v],
    [L({ stepUp: 'atDeath' }), 'stepUp', D.scores.tax_gains_at_death.v],
    [L({ stepUp: 'carryover' }), 'stepUp', D.scores.carryover_basis.v],
    [L({ system: 'vat5', vatBase: 'broad' }), 'system', D.scores.vat_broad.v],
    [L({ system: 'ftt' }), 'system', D.scores.ftt.v]
  ];
  cases.forEach(([lev, id, expected]) => {
    const r = model(lev, A());
    const c = r.revenue.components.find(x => x.id === id);
    ok(c, `component ${id} missing`);
    near(c.net, expected, 1e-9, `component ${id} value`);
    ok(c.window && String(c.window).length > 0, `component ${id} must carry its budget window`);
    ok(c.baseline === 'pre-obbba' || c.baseline === 'post-obbba', `component ${id} must declare its OBBBA baseline (got ${c.baseline})`);
    ok(c.source && c.source.length > 10, `component ${id} must name its scorer`);
  });
  note.push(`  test 6: ${cases.length} pre-scored components match data/ exactly and carry window + baseline + scorer`);
});

/* ── 7. No reachable state shows a rate cut with net-positive revenue ───── */
t('7. No rate cut, at any assumption setting, produces net-positive revenue', () => {
  const etis = [0.12, 0.25, 0.40, 0.57];
  const lenses = ['cbo', 'consensus', 'taxfoundation'];
  const regimes = ['normal', 'recession'];
  let checked = 0;
  etis.forEach(eti => lenses.forEach(lens => regimes.forEach(regime => {
    const a = A({ eti, lens, multiplierRegime: regime });
    for (let rate = 10; rate < 37; rate += 1) {
      const r = model(L({ topRate: rate }), a);
      ok(r.revenue.tenYear.net < 0, `top rate cut to ${rate}% showed ${r.revenue.tenYear.net.toFixed(1)}B (eti ${eti}, lens ${lens})`);
      ok(r.guards.selfFinancingViolation === false, 'guard must not trip on a correctly negative cut');
      checked++;
    }
    for (let rate = 5; rate < 23.8; rate += 1) {
      const r = model(L({ capGainsRate: rate }), a);
      ok(r.revenue.tenYear.net < 0, `capital-gains cut to ${rate}% showed ${r.revenue.tenYear.net.toFixed(1)}B`);
      checked++;
    }
    for (let rate = 10; rate < 21; rate += 1) {
      const r = model(L({ corporateRate: rate }), a);
      ok(r.revenue.tenYear.net < 0, `corporate cut to ${rate}% showed ${r.revenue.tenYear.net.toFixed(1)}B`);
      checked++;
    }
    for (let f = 5; f < 19; f += 1) {
      const r = model(L({ system: 'flat', flatRate: f }), a);
      ok(r.revenue.tenYear.net < 0, `flat tax at ${f}% showed ${r.revenue.tenYear.net.toFixed(1)}B`);
      checked++;
    }
  })));
  // Macro feedback must be structurally excluded from the revenue number, so it
  // cannot rescue a cut. Assert the field exists and is never added in.
  const r = model(L({ topRate: 25 }), A({ lens: 'taxfoundation' }));
  near(r.revenue.tenYear.net, r.revenue.tenYear.static + r.revenue.tenYear.behavioral + r.revenue.tenYear.enforcement, 1e-6,
    'net revenue must be exactly static + behavioral + enforcement — macro feedback is never folded in');
  note.push(`  test 7: ${checked} rate-cut states swept across 4 ETI x 3 lens x 2 regime settings, all net-negative`);
});

/* ─────────── 8. Corporate incidence dial visibly moves the class chart ─── */
t('8. The corporate-incidence dial visibly moves the by-class chart', () => {
  const lo = model(L({ corporateRate: 28 }), A({ corpLaborShare: 18 }));
  const hi = model(L({ corporateRate: 28 }), A({ corpLaborShare: 70 }));
  const gl = k => lo.byClass.find(x => x.key === k).dAfterTaxPct;
  const gh = k => hi.byClass.find(x => x.key === k).dAfterTaxPct;
  ok(Math.abs(gl('middle') - gh('middle')) > 0.01, 'the middle quintile must move when the incidence dial moves');
  ok(gh('middle') < gl('middle'), 'a higher labor share must push more of a corporate rate rise onto middle-income households');
  ok(gh('top1') > gl('top1'), 'a higher labor share must move burden OFF the top 1%');
  // Revenue must NOT change — incidence is a distribution assumption, not a revenue one.
  near(lo.revenue.tenYear.net, hi.revenue.tenYear.net, 1e-9, 'the incidence dial must not change total revenue');
  note.push(`  test 8: middle quintile after-tax income ${gl('middle').toFixed(3)}% at 18% labor share vs ${gh('middle').toFixed(3)}% at 70%`);
});

/* ─────── 9. Lens swap changes the GDP band and its shop attribution ───── */
t('9. The macro-lens swap changes both GDP band endpoints and the named shop', () => {
  const base = L({ topRate: 45 });
  const a = model(base, A({ lens: 'cbo' }));
  const b = model(base, A({ lens: 'taxfoundation' }));
  ok(a.gdp.loPct !== b.gdp.loPct || a.gdp.hiPct !== b.gdp.hiPct, 'lens swap must move the GDP band');
  ok(a.gdp.lensLabel !== b.gdp.lensLabel, 'lens swap must change the named lens');
  ok(/CBO/i.test(a.gdp.lensLabel), 'the CBO lens must name CBO');
  ok(/Tax Foundation/i.test(b.gdp.lensLabel), 'the Tax Foundation lens must name Tax Foundation');
  ok(a.gdp.hiPct > a.gdp.loPct, 'the GDP output must be a band, never a point');
  ok(b.gdp.hiPct > b.gdp.loPct, 'the GDP output must be a band, never a point');
  // The regime toggle is contested and must ship both citations. It is checked on a
  // lever that reaches lower- and middle-income households: the regime cap comes from
  // Ramey & Zubairy's "below unity" finding, and CBO's own multiplier range for a
  // tax cut aimed at HIGHER-income people (0.1-0.6) is already below unity, so on a
  // top-rate-only change the cap correctly does not bind. That is a real property of
  // the sources, not a bug, and the UI says so.
  const flat = L({ system: 'flat', flatRate: 17 });
  const rec = model(flat, A({ multiplierRegime: 'recession' }));
  const nor = model(flat, A({ multiplierRegime: 'normal' }));
  ok(rec.gdp.loPct !== nor.gdp.loPct || rec.gdp.hiPct !== nor.gdp.hiPct, 'the multiplier regime must move the band on a lever that reaches lower- and middle-income households');
  const recTop = model(base, A({ multiplierRegime: 'recession' }));
  const norTop = model(base, A({ multiplierRegime: 'normal' }));
  ok(recTop.gdp.loPct === norTop.gdp.loPct && recTop.gdp.hiPct === norTop.gdp.hiPct,
    'on a top-rate-only change the regime must NOT move the band — CBO\'s high-income multiplier range is already below unity');
  ok(rec.gdp.contested && /Ramey/.test(JSON.stringify(rec.gdp.citations)) && /Auerbach/.test(JSON.stringify(rec.gdp.citations)),
    'the multiplier regime must be flagged contested and carry BOTH citations');
  note.push(`  test 9: CBO lens ${a.gdp.loPct.toFixed(1)}–${a.gdp.hiPct.toFixed(1)}% of GDP; Tax Foundation lens ${b.gdp.loPct.toFixed(1)}–${b.gdp.hiPct.toFixed(1)}%`);
});

/* ═════════ Extra invariants that Phase 0's findings made load-bearing ════ */

/* 10. ETI is endogenous to the base — Diamond & Saez, 0.57 vs 0.17 */
t('10. ETI couples to base broadening: full broadening scales it by the Diamond–Saez ratio', () => {
  const none = model(L({ topRate: 45 }), A({ eti: 0.57 }));
  const all = Object.assign(clone(CURRENT_LAW.loopholes), {
    s199a: true, health: 'p50', salt: true, mortgage: true, muniPA: true, carriedInterest: true, cryptoWash: true
  });
  const broad = model(L({ topRate: 45, stepUp: 'atDeath', taxGainsAtDeath: true, loopholes: all }), A({ eti: 0.57 }));
  ok(broad.diagnostics.etiEffective < none.diagnostics.etiEffective, 'broadening the base must lower the effective ETI');
  near(broad.diagnostics.broadeningIndex, 1, 0.001, 'closing every available broadener should be a broadening index of 1');
  near(broad.diagnostics.etiEffective, 0.17, 0.005, 'at full broadening the effective ETI must land on Diamond & Saez\'s broad-base 0.17');
  // Partial broadening must land strictly between the two anchors.
  const half = model(L({ topRate: 45, loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { s199a: true, health: 'p50' }) }), A({ eti: 0.57 }));
  ok(half.diagnostics.etiEffective < 0.57 && half.diagnostics.etiEffective > 0.17, 'partial broadening must land between the anchors');
  note.push(`  test 10: ETI 0.570 -> ${half.diagnostics.etiEffective.toFixed(3)} (partial) -> ${broad.diagnostics.etiEffective.toFixed(3)} (full)`);
});

/* 11. Holding ETI fixed while broadening must warn, loudly, in the why-panel */
t('11. Holding ETI fixed while broadening the base raises a why-panel warning', () => {
  const lev = L({ topRate: 45, loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { s199a: true, salt: true }) });
  const coupled = model(lev, A());
  const held = model(lev, A({ holdEtiFixed: true }));
  const warnings = held.why.reduce((n, w) => n + w.warnings.length, 0);
  ok(warnings > 0, 'holding ETI fixed while broadening must produce at least one warning');
  ok(/elasticity|ETI/i.test(JSON.stringify(held.why)), 'the warning must name the elasticity');
  near(held.diagnostics.etiEffective, held.diagnostics.etiBase, 1e-9, 'held ETI must not be scaled');
  ok(coupled.diagnostics.etiEffective < held.diagnostics.etiEffective, 'the coupled run must use a lower ETI than the held run');
});

/* 12. Unscored levers are named and excluded from the total, never silently dropped */
t('12. Levers with no published score are excluded from the total and listed by name', () => {
  const r = model(L({ payrollCap: 'eliminate', payrollBenefitCredit: false }), A());
  ok(r.unscored.length > 0, 'eliminating the cap has no published ten-year dollar score and must be listed as unscored');
  ok(r.unscored.some(u => /payroll/i.test(u.id + u.label)), 'the unscored item must name the payroll cap');
  near(r.revenue.tenYear.net, 0, 1e-9, 'an unscored lever must contribute nothing to the revenue total');
  ok(/67/.test(JSON.stringify(r.why)), 'the no-benefit-credit variant must report SSA provision E2.1 closing 67% of the shortfall');
  const credited = model(L({ payrollCap: 'eliminate', payrollBenefitCredit: true }), A());
  ok(/48/.test(JSON.stringify(credited.why)), 'the with-benefit-credit variant must report 48%');
  ok(/E2\.1/.test(JSON.stringify(r.why)) && /E2\.2/.test(JSON.stringify(credited.why)), 'each variant must name its SSA provision id');
});

/* 13. The never-claim list is enforced on every generated string */
t('13. No generated string can breach the never-claim list', () => {
  const banned = [/pays? for (itself|themselves)/i, /self-financ/i, /optimal (top )?(tax )?rate is/i, /will (raise|grow) GDP by [\d.]+%/i, /guaranteed/i];
  const states = [
    L({ topRate: 70, topRateThreshold: '10m' }),
    L({ topRate: 25 }),
    L({ capGainsRate: 39.6, taxGainsAtDeath: true, stepUp: 'atDeath' }),
    L({ system: 'flat', flatRate: 17 }),
    L({ system: 'fairtax' }),
    L({ system: 'wealth' }),
    L({ corporateRate: 35, enforcement: 100 }),
    L({ payrollCap: 'donut250k', loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { s199a: true, mortgage: true }) })
  ];
  states.forEach((lev, i) => {
    ['cbo', 'consensus', 'taxfoundation'].forEach(lens => {
      const s = JSON.stringify(model(lev, A({ lens })));
      banned.forEach(re => ok(!re.test(s), `state ${i} (lens ${lens}) breached never-claim pattern ${re}`));
    });
  });
  // The GDP output must never be exposed as a single number.
  const r = model(L({ topRate: 60 }), A());
  ok(r.gdp.point === undefined, 'the model must not expose a point GDP estimate');
  ok(typeof r.gdp.loPct === 'number' && typeof r.gdp.hiPct === 'number', 'GDP must be a two-ended band');
  ok(r.gdp.hiPct - r.gdp.loPct > 0, 'the GDP band must have width');
});

/* 14. Contested and range-valued items keep both numbers, never an average */
t('14. Contested estimates ship as ranges with attribution, never averaged', () => {
  const w = model(L({ system: 'wealth' }), A());
  const c = w.revenue.components.find(x => x.id === 'system');
  ok(c.range && c.range.length === 2 && c.range[1] > c.range[0], 'the wealth tax must emit a range');
  ok(c.attributions && c.attributions.length >= 3, 'the wealth tax must carry at least three named attributions');
  ok(/Summers/.test(JSON.stringify(c.attributions)) && /Saez/.test(JSON.stringify(c.attributions)),
    'both the low and high attributions must be named');
  const f = model(L({ system: 'fairtax' }), A()).revenue.components.find(x => x.id === 'system');
  ok(f.range && f.range[0] < f.range[1], 'the FairTax must emit a range, not a point');
  ok(/23/.test(JSON.stringify(f)) && /30/.test(JSON.stringify(f)), 'the FairTax must carry both the 23% inclusive and 30% exclusive framings');
  // Capital gains must produce a range too — the published spread is 3–5x.
  const cg = model(L({ capGainsRate: 28.8 }), A()).revenue.components.find(x => x.id === 'capGains');
  ok(cg.range && cg.range[0] !== cg.range[1], 'the capital-gains lever must emit a range across elasticity regimes');
});


/* ═══════════════════════════════════════════════════════════════════════════
   Act 3 — the scenario library. Cases 15-20.

   Written BEFORE act3-cards.js existed, before build-act2-data.js emitted a
   cards payload, and before any Act 3 markup — same discipline as cases 1-14.
   Phase 2's first engine run was 11/3 and all three failures rendered as
   perfectly plausible charts. A scenario card with a wrong number looks fine
   too, so none of the checks below are allowed to be "by inspection".
   ═════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const CARDS_MOD = require('./act3-cards.js');
const RAW_SCEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'learn', 'tax-explorer', 'data', 'scenarios.json'), 'utf8'));
const RAW_ARRS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'learn', 'tax-explorer', 'data', 'series-arrays.json'), 'utf8'));
const RAW_EXP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'learn', 'tax-explorer', 'data', 'expenditures.json'), 'utf8'));
const RAW_FILES = { scenarios: RAW_SCEN, 'series-arrays': RAW_ARRS, expenditures: RAW_EXP };
const DATA = require('./act2-data.json');
const SECTION_HTML = fs.readFileSync(path.join(__dirname, 'ui', 'act2-section.html.part'), 'utf8');

function resolvePath(root, dotted) {
  return dotted.split('.').reduce((o, k) => {
    if (o === undefined || o === null) return undefined;
    return /^\d+$/.test(k) ? o[Number(k)] : o[k];
  }, root);
}

/* ── 15. The library is the gameplan's twelve, each structurally complete ── */
t('15. Twelve cards, each with the full card shape the gameplan requires', () => {
  const cards = CARDS_MOD.buildCards(DATA);
  ok(cards.length === 12, `expected 12 scenario cards, got ${cards.length}`);
  const ids = new Set();
  cards.forEach(c => {
    ok(c.id && !ids.has(c.id), `duplicate or missing card id: ${c.id}`);
    ids.add(c.id);
    ok(c.title && c.title.length > 3, `${c.id}: needs a title`);
    ok(c.whatChanges && c.whatChanges.length > 20, `${c.id}: needs a "what changes" line`);
    ok(Array.isArray(c.why) && c.why.length >= 1, `${c.id}: needs a "why" chain`);
    ok(typeof c.evidence === 'string' && c.evidence.length > 3, `${c.id}: needs an evidence-strength string`);
    ok(Array.isArray(c.critics) && c.critics.length >= 1, `${c.id}: needs at least one "what critics say" entry`);
    ok(Array.isArray(c.sources) && c.sources.length >= 1, `${c.id}: needs sources`);
    ok(['engine', 'spend', 'published', 'baseline'].indexOf(c.kind) > -1, `${c.id}: unknown kind ${c.kind}`);
  });
  // The MOOT card must not be in the library.
  ok(!ids.has('restore_pre_tcja_rates'), 'restore_pre_tcja_rates is MOOT in the data and must not ship as a card');
  ok(ids.has('obbba_baseline'), 'the OBBBA baseline card must take the moot card\'s slot');
  note.push(`test 15: ${cards.length} cards — ${[...ids].join(', ')}`);
});

/* ── 16. Evidence-strength strings come from data/, never invented here ──── */
t('16. Every evidence-strength badge is the verbatim string from scenarios.json', () => {
  const cards = CARDS_MOD.buildCards(DATA);
  cards.forEach(c => {
    ok(c.evidenceFrom, `${c.id}: must declare which data path its evidence string came from`);
    const fromFile = resolvePath(RAW_SCEN, c.evidenceFrom);
    ok(typeof fromFile === 'string', `${c.id}: ${c.evidenceFrom} is not a string in scenarios.json`);
    ok(c.evidence === fromFile,
      `${c.id}: evidence badge "${c.evidence}" does not match scenarios.json "${fromFile}"`);
  });
});

/* ── 17. Gameplan §9 test 6, made mechanical: card numbers === data/ ─────── */
t('17. Every number a card displays resolves to data/ at the path it claims', () => {
  const cards = CARDS_MOD.buildCards(DATA);
  let checked = 0;
  cards.forEach(c => {
    ok(Array.isArray(c.figures), `${c.id}: must expose its displayed figures as an array`);
    ok(c.figures.length >= 1, `${c.id}: must display at least one sourced figure`);
    c.figures.forEach(f => {
      ok(f.path, `${c.id}: figure "${f.label}" must declare its data path`);
      const root = RAW_FILES[f.file || 'scenarios'];
      ok(root, `${c.id}: figure "${f.label}" names an unknown data file "${f.file}"`);
      const v = resolvePath(root, f.path);
      ok(v !== undefined, `${c.id}: ${f.path} does not resolve in ${f.file || 'scenarios'}.json`);
      ok(v === f.value,
        `${c.id}: figure "${f.label}" shows ${JSON.stringify(f.value)} but ${f.path} holds ${JSON.stringify(v)}`);
      // Content Engine Policy: no dollar figure without its period, no score without its scorer.
      ok(f.period && String(f.period).length > 1, `${c.id}: figure "${f.label}" has no period`);
      ok(f.url && /^https?:\/\//.test(f.url), `${c.id}: figure "${f.label}" has no source URL`);
      checked++;
    });
  });
  note.push(`test 17: ${checked} displayed figures traced to data/`);
});

/* ── 18. Levers are real keys, and inside the UI's own declared ranges ───── */
t('18. Every card\'s levers object is valid and within the UI controls\' ranges', () => {
  // Parse the shipped markup rather than trusting a duplicated table here: the
  // question is whether a preset can be represented by the controls a visitor has.
  const ranges = {};
  SECTION_HTML.replace(/<input[^>]*type="range"[^>]*>/g, tag => {
    const id = (tag.match(/id="tx-([A-Za-z0-9]+)"/) || [])[1];
    const min = Number((tag.match(/min="([-\d.]+)"/) || [])[1]);
    const max = Number((tag.match(/max="([-\d.]+)"/) || [])[1]);
    const step = Number((tag.match(/step="([\d.]+)"/) || [])[1]);
    if (id) ranges[id] = { min, max, step };
    return tag;
  });
  ok(Object.keys(ranges).length >= 5, 'failed to parse the range inputs out of act2-section.html');

  const selects = {};
  SECTION_HTML.replace(/<select[^>]*id="tx-([A-Za-z0-9-]+)"[^>]*>([\s\S]*?)<\/select>/g, (m, id, body) => {
    selects[id] = (body.match(/value="([^"]*)"/g) || []).map(s => s.slice(7, -1));
    return m;
  });
  const radios = {};
  SECTION_HTML.replace(/<input[^>]*type="radio"[^>]*>/g, tag => {
    const name = (tag.match(/name="tx-([A-Za-z0-9]+)"/) || [])[1];
    const val = (tag.match(/value="([^"]*)"/) || [])[1];
    if (name) (radios[name] = radios[name] || []).push(val);
    return tag;
  });

  const LOOPHOLE_KEYS = Object.keys(CURRENT_LAW.loopholes);
  const cards = CARDS_MOD.buildCards(DATA);
  const variants = [];
  cards.forEach(c => {
    variants.push([c.id, c.levers]);
    (c.variants || []).forEach((v, i) => variants.push([`${c.id}/variant ${i + 1}`, v.levers]));
  });
  ok(variants.length >= 12, 'expected at least twelve lever objects');

  variants.forEach(([id, lev]) => {
    ok(lev && typeof lev === 'object', `${id}: levers must be an object`);
    Object.keys(lev).forEach(k => {
      ok(Object.prototype.hasOwnProperty.call(CURRENT_LAW, k), `${id}: unknown lever key "${k}" — the engine does not read it`);
      if (k === 'loopholes') {
        Object.keys(lev.loopholes).forEach(lk => {
          ok(LOOPHOLE_KEYS.indexOf(lk) > -1, `${id}: unknown loophole key "${lk}"`);
          if (lk === 'health') ok((selects['lp-health'] || []).indexOf(lev.loopholes[lk]) > -1,
            `${id}: health value "${lev.loopholes[lk]}" is not an option the UI offers`);
          else ok(typeof lev.loopholes[lk] === 'boolean', `${id}: loophole ${lk} must be boolean`);
        });
      }
    });
    // Numeric levers must be reachable on the slider the visitor actually has.
    [['topRate', 'topRate'], ['corporateRate', 'corporateRate'], ['flatRate', 'flatRate'], ['enforcement', 'enforcement']]
      .forEach(([leverKey, ctrl]) => {
        if (lev[leverKey] === undefined) return;
        const R = ranges[ctrl];
        ok(R, `${id}: no UI control found for ${leverKey}`);
        ok(lev[leverKey] >= R.min && lev[leverKey] <= R.max,
          `${id}: ${leverKey}=${lev[leverKey]} is outside the UI range ${R.min}–${R.max}`);
        const steps = (lev[leverKey] - R.min) / R.step;
        ok(Math.abs(steps - Math.round(steps)) < 1e-9,
          `${id}: ${leverKey}=${lev[leverKey]} does not land on the control's ${R.step} step`);
      });
    if (lev.capGainsRate !== undefined) {
      // The slider is statutory; the model works all-in (statutory + 3.8 NIIT).
      const statutory = lev.capGainsRate - 3.8, R = ranges.capGainsRate;
      ok(statutory >= R.min && statutory <= R.max,
        `${id}: capGainsRate ${lev.capGainsRate} all-in = ${statutory.toFixed(1)} statutory, outside the UI range ${R.min}–${R.max}`);
    }
    if (lev.system !== undefined) ok((radios.system || []).indexOf(lev.system) > -1, `${id}: system "${lev.system}" is not a UI option`);
    if (lev.payrollCap !== undefined) ok((radios.payrollCap || []).indexOf(lev.payrollCap) > -1, `${id}: payrollCap "${lev.payrollCap}" is not a UI option`);
    if (lev.stepUp !== undefined) ok((selects.stepUp || []).indexOf(lev.stepUp) > -1, `${id}: stepUp "${lev.stepUp}" is not a UI option`);
    if (lev.topRateThreshold !== undefined) ok((selects.topRateThreshold || []).indexOf(lev.topRateThreshold) > -1, `${id}: threshold "${lev.topRateThreshold}" is not a UI option`);
    if (lev.wealthScorer !== undefined) ok((selects.wealthScorer || []).indexOf(lev.wealthScorer) > -1, `${id}: wealthScorer "${lev.wealthScorer}" is not a UI option`);
    if (lev.fairtaxAssumption !== undefined) ok((selects.fairtaxAssumption || []).indexOf(lev.fairtaxAssumption) > -1, `${id}: fairtaxAssumption "${lev.fairtaxAssumption}" is not a UI option`);
    if (lev.vatBase !== undefined) ok((selects.vatBase || []).indexOf(lev.vatBase) > -1, `${id}: vatBase "${lev.vatBase}" is not a UI option`);
    // And the engine must actually run it without tripping its own guard.
    const r = model(Object.assign(clone(CURRENT_LAW), lev), A());
    ok(r.guards.selfFinancingViolation === false, `${id}: tripped the self-financing guard`);
  });
  note.push(`test 18: ${variants.length} lever objects checked against the shipped controls`);
});

/* ── 19. URL state round-trips as identity ──────────────────────────────── */
t('19. levers -> encode -> decode -> levers is the identity', () => {
  const enc = CARDS_MOD.encodeState, dec = CARDS_MOD.decodeState;
  ok(typeof enc === 'function' && typeof dec === 'function', 'act3-cards.js must export encodeState/decodeState');
  const cards = CARDS_MOD.buildCards(DATA);
  const states = cards.map(c => ({ levers: Object.assign(clone(CURRENT_LAW), c.levers), assumptions: clone(DEFAULT_ASSUMPTIONS) }));
  // plus a hand-built adversarial state touching every field
  states.push({
    levers: L({
      topRate: 62.5, topRateThreshold: '5m', capGainsRate: 31.8, taxGainsAtDeath: true, stepUp: 'carryover',
      corporateRate: 28, payrollCap: 'donut250k', payrollBenefitCredit: false,
      loopholes: { s199a: true, health: 'p50inc', salt: true, mortgage: true, muniPA: true, carriedInterest: true, cryptoWash: true },
      enforcement: -60, system: 'vat5', vatBase: 'narrow', flatRate: 22.5,
      wealthScorer: 'summers_sarin', fairtaxAssumption: 'high', directToTransfers: true
    }),
    assumptions: A({ eti: 0.57, holdEtiFixed: true, corpLaborShare: 70, multiplierRegime: 'recession', lens: 'taxfoundation' })
  });
  states.forEach((s, i) => {
    const round = dec(enc(s.levers, s.assumptions));
    ok(round, `state ${i}: decode returned nothing`);
    ok(JSON.stringify(round.levers) === JSON.stringify(s.levers),
      `state ${i}: levers did not round-trip\n  in  ${JSON.stringify(s.levers)}\n  out ${JSON.stringify(round.levers)}`);
    ok(JSON.stringify(round.assumptions) === JSON.stringify(s.assumptions),
      `state ${i}: assumptions did not round-trip`);
  });
  // Garbage in must not throw and must not half-apply.
  [null, undefined, '', 'not-base64!!', Buffer.from('{"nope":1}').toString('base64')].forEach(bad => {
    let out;
    try { out = dec(bad); } catch (e) { ok(false, `decode threw on ${JSON.stringify(bad)}: ${e.message}`); }
    ok(out === null, `decode must return null on invalid input ${JSON.stringify(bad)}, got ${JSON.stringify(out)}`);
  });
  note.push(`test 19: ${states.length} states round-tripped, 5 malformed inputs rejected`);
});

/* ── 20. The never-claim list holds across every word of every card ──────── */
t('20. No card\'s copy breaches the never-claim list', () => {
  const banned = [
    { re: /pays? for (itself|themselves)/i, what: 'self-financing' },
    { re: /self-financ/i, what: 'self-financing' },
    { re: /optimal (top )?(tax )?rate is/i, what: 'optimal-rate claim' },
    { re: /will (raise|grow|boost) GDP by [\d.]+ ?%/i, what: 'point GDP estimate' },
    { re: /GDP (would|will) (rise|grow|increase) [\d.]+ ?%/i, what: 'point GDP estimate' },
    { re: /\bguaranteed\b/i, what: 'false certainty' },
    { re: /\bcertainly (will|would)\b/i, what: 'false certainty' },
    { re: /in year (one|two|three|\d)\b.*GDP/i, what: 'year-by-year macro path' }
  ];
  // Same property as smoke-act2.js's scan: a REFUTED claim passes, an asserted one
  // does not. A sentence is exempt only if the same sentence carries a negation
  // or is inside a quoted refutation.
  const NEGATED = /\b(no|not|never|cannot|can't|does not|doesn't|won't|would not|nothing|out of reach|impossible|rules out|makes .* impossible)\b/i;
  const cards = CARDS_MOD.buildCards(DATA);
  let sentences = 0, exempted = 0;
  cards.forEach(c => {
    const copy = []
      .concat([c.title, c.whatChanges, c.evidence, c.engineNote || ''])
      .concat(c.why || [])
      .concat((c.notes || []))
      .concat((c.critics || []).map(x => [x.claim, x.quote, x.quote2, x.note].filter(Boolean).join(' ')))
      .concat((c.figures || []).map(f => [f.label, f.quote, f.note].filter(Boolean).join(' ')))
      .filter(Boolean).join(' ');
    copy.split(/(?<=[.!?])\s+/).forEach(sentence => {
      sentences++;
      banned.forEach(({ re, what }) => {
        if (!re.test(sentence)) return;
        if (NEGATED.test(sentence)) { exempted++; return; }
        ok(false, `${c.id}: ${what} asserted without refutation — "${sentence.trim()}"`);
      });
    });
  });
  note.push(`test 20: ${sentences} card sentences scanned, ${exempted} cited negations allowed through`);
});

/* ── 21. Spend cards convert nothing; the poverty readout stays attributed ─ */
t('21. Spending cards price a program and never model a poverty elasticity', () => {
  const cards = CARDS_MOD.buildCards(DATA);
  const spend = cards.filter(c => c.kind === 'spend');
  ok(spend.length === 2, `expected two spending cards (vouchers, CTC), got ${spend.length}`);
  spend.forEach(c => {
    ok(c.annualCostBn > 0, `${c.id}: a spending card must carry an annual price`);
    ok(c.povertyEvidence, `${c.id}: a spending card must carry its published poverty evidence`);
    ok(c.povertyEvidence.published === true, `${c.id}: the poverty figure must be flagged as published, not modelled`);
    ok(c.povertyEvidence.scorer && c.povertyEvidence.scorer.length > 4, `${c.id}: the poverty figure must name whose it is`);
    // Same rule the never-claim scan uses: a REFUTED mention passes, an applied one
    // does not. "this tool applies no poverty elasticity" is the disclosure we want;
    // "we apply an elasticity of 0.4" is the thing that must never ship.
    String(JSON.stringify(c.povertyEvidence)).split(/(?<=[.!?])\s+/).forEach(sentence => {
      if (!/elasticit/i.test(sentence)) return;
      ok(/\b(no|not|never|cannot|does not|doesn't|without)\b/i.test(sentence),
        `${c.id}: a poverty elasticity is applied rather than refused — "${sentence.trim()}"`);
      ok(!/elasticit[a-z]*\s*(of|=|:)?\s*-?\d/i.test(sentence),
        `${c.id}: a numeric poverty elasticity must never appear — "${sentence.trim()}"`);
    });
  });
  // The engine itself still refuses to convert dollars into a rate.
  const r = model(L({ topRate: 50, directToTransfers: true }), A());
  ok(r.poverty.scored === false, 'the engine must still not score poverty from free-form lever settings');
  ok(r.poverty.annualBn > 0, 'the transfer readout must still report the dollars');
});


/* ── 22. No why-panel can ship without its methodology link ─────────────── */
t('22. Every why-panel ends with "Full methodology →"', () => {
  const states = [
    L({ topRate: 55 }), L({ capGainsRate: 33.8 }), L({ corporateRate: 28 }),
    L({ stepUp: 'atDeath' }), L({ enforcement: 100 }), L({ system: 'wealth' }),
    L({ system: 'flat', flatRate: 17 }), L({ payrollCap: 'eliminate' }),
    L({ loopholes: Object.assign(clone(CURRENT_LAW.loopholes), { s199a: true, salt: true }) })
  ];
  let panels = 0;
  states.forEach((lev, i) => {
    const r = model(lev, A());
    ok(r.why.length > 0, `state ${i} produced no why-panel at all`);
    r.why.forEach(w => {
      panels++;
      const last = w.links[w.links.length - 1];
      ok(last && /methodology/i.test(last.url), `state ${i}, panel "${w.title}" does not end with a methodology link`);
      ok(/Full methodology/.test(last.text), `state ${i}, panel "${w.title}" link text is "${last && last.text}"`);
    });
  });
  note.push(`test 22: ${panels} why-panels, every one linked to the methodology page`);
});

/* ─────────────────────────────── report ──────────────────────────────── */
const W = results.reduce((m, r) => Math.max(m, r[1].length), 0);
console.log('\nTax Ladder — Act 2 model tests (gameplan §9)\n' + '='.repeat(W + 10));
results.forEach(([s, n, m]) => {
  console.log(`${s === 'PASS' ? ' ok ' : 'FAIL'}  ${n}${m ? '\n        ↳ ' + m : ''}`);
});
if (note.length) console.log('\nObserved values:\n' + note.join('\n'));
console.log('\n' + '='.repeat(W + 10));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
