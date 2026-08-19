#!/usr/bin/env node
/**
 * build-act2-data.js — Tax Ladder / Act 2 (Phase 2)
 *
 * Reads the canonical, verified data files in learn/tax-explorer/data/ and emits a
 * MINIFIED, quote-stripped payload for the Act 2 engine + charts.
 *
 * The hard rule of this project: learn/tax-explorer/data/ is the single source of
 * truth for every number the tool displays. This script only SELECTS and RESHAPES.
 * It never introduces a figure. Every numeric literal below that is not an index,
 * a label or a structural constant is copied from a `data/` datum and carries a
 * `src` string naming where it came from.
 *
 * Usage:  node build-act2-data.js [--data <dir>] [--out <file>]
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const DATA = arg('--data', path.join(__dirname, '..', '..', 'learn', 'tax-explorer', 'data'));
const OUT  = arg('--out',  path.join(__dirname, 'act2-data.json'));

const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const soiT  = read('soi-table-3-5.json');
const cbo   = read('cbo-distribution.json');
const exp   = read('expenditures.json');
const par   = read('parameters.json');
const base  = read('baseline-fy2025.json');
const scen  = read('scenarios.json');
const soiP  = read('soi-percentiles.json');
const arrs  = read('series-arrays.json');
const hist  = read('history-series.json');

const fail = m => { console.error('BUILD FAILED: ' + m); process.exit(1); };

/* ---------------------------------------------------------------- SOI 3.5 */
// Column indices verified against soi-table-3-5.json._meta.columns, then
// re-verified arithmetically below (income x rate must equal tax at rate).
const IDX = {
  label: 0, returns: 1, taxableIncome: 2, taxAllRates: 4,
  ord: { 10: [9, 10], 12: [15, 16], 22: [24, 25], 24: [27, 28], 32: [36, 37], 35: [39, 40], 37: [42, 43] },
  cg:  { 0: [7, null], 15: [18, 19], 20: [21, 22], 25: [30, 31], 28: [33, 34] }
};

// AGI class lower bounds, parsed from the class label (the label IS the source).
function loBound(label) {
  if (/^Total$/.test(label)) return null;
  if (/^Under \$([\d,]+)/.test(label)) return 0;
  const m = label.match(/^\$([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
function hiBound(label) {
  if (/^Total$/.test(label)) return null;
  let m = label.match(/^Under \$([\d,]+)/);
  if (m) return Number(m[1].replace(/,/g, ''));
  m = label.match(/under \$([\d,]+)/);
  if (m) return Number(m[1].replace(/,/g, ''));
  if (/or more/.test(label)) return Infinity;
  return null;
}

const soiRows = soiT.data.filter(r => r[0] !== 'Total');
const soiTotal = soiT.data.find(r => r[0] === 'Total');

// Arithmetic self-check on the Total row: this catches a column-index slip.
Object.entries(IDX.ord).forEach(([rate, [iInc, iTax]]) => {
  const inc = soiTotal[iInc], tax = soiTotal[iTax];
  const implied = tax / inc;
  if (Math.abs(implied - Number(rate) / 100) > 0.0005)
    fail(`SOI column check: ordinary ${rate}% implies ${(implied * 100).toFixed(3)}%`);
});
Object.entries(IDX.cg).forEach(([rate, [iInc, iTax]]) => {
  if (iTax === null) return;
  const implied = soiTotal[iTax] / soiTotal[iInc];
  if (Math.abs(implied - Number(rate) / 100) > 0.0005)
    fail(`SOI column check: capital-gains ${rate}% implies ${(implied * 100).toFixed(3)}%`);
});
// The rate bands must partition taxable income (they do, to ~0.03%).
{
  let sum = 0;
  Object.values(IDX.ord).forEach(([i]) => sum += soiTotal[i]);
  Object.values(IDX.cg).forEach(([i]) => sum += soiTotal[i]);
  sum += soiTotal[45]; // Form 8615
  sum += soiTotal[12]; // 10% from Form 8814
  const ti = soiTotal[IDX.taxableIncome];
  if (Math.abs(sum - ti) / ti > 0.002)
    fail(`SOI rate bands do not partition taxable income (${sum} vs ${ti})`);
}

const ORD_RATES = [10, 12, 22, 24, 32, 35, 37];
const CG_RATES  = [0, 15, 20, 25, 28];

const soi = {
  y: soiT._meta.published ? 'TY2023' : 'TY2023',
  unit: 'usd_thousands',
  ordRates: ORD_RATES,
  cgRates: CG_RATES,
  // c = [label, lo, hi, returns, taxableIncome, taxAllRates, ...ordIncome[7], ...cgIncome[5]]
  c: soiRows.map(r => [
    r[IDX.label], loBound(r[IDX.label]), hiBound(r[IDX.label]) === Infinity ? null : hiBound(r[IDX.label]),
    r[IDX.returns], r[IDX.taxableIncome], r[IDX.taxAllRates]
  ].concat(ORD_RATES.map(x => r[IDX.ord[x][0]]))
   .concat(CG_RATES.map(x => r[IDX.cg[x][0]])))
};

/* ------------------------------------------------------- CBO distribution */
const GRP = {
  lowest: 'Lowest quintile', second: 'Second quintile', middle: 'Middle quintile',
  fourth: 'Fourth quintile', highest: 'Highest quintile', top1: 'Top 1 percent'
};
const YR = 2022;
function cboRow(table, key) {
  const rows = cbo[table].data[GRP[key]];
  const r = rows.find(x => x[0] === YR);
  if (!r) fail(`CBO ${table} has no ${YR} row for ${key}`);
  return r;
}
const cboOut = { y: YR, g: {} };
Object.keys(GRP).forEach(k => {
  const inc  = cboRow('average_household_income', k);   // [yr, mkt, si, before, transfers, fedTax, after]
  const rate = cboRow('average_federal_tax_rates', k);  // [yr, total, ind, payroll, corp, excise]
  const shr  = cboRow('household_income_shares', k);    // [yr, mkt, before, after]
  const tsh  = cboRow('federal_tax_shares', k);         // [yr, total, ind, payroll, corp, excise]
  const dem  = cboRow('demographics', k);               // [yr, households(M), people, ...]
  cboOut.g[k] = {
    hh: dem[1],            // millions of households
    incBefore: inc[3],     // avg income before transfers and taxes, 2022 $
    incAfter: inc[6],      // avg income after transfers and taxes, 2022 $
    fedTax: inc[5],        // avg federal taxes, 2022 $
    rate: rate[1], rInd: rate[2], rPay: rate[3], rCorp: rate[4], rExc: rate[5],
    shrBefore: shr[2], shrAfter: shr[3],
    tShare: tsh[1], tShareInd: tsh[2], tSharePayroll: tsh[3], tShareCorp: tsh[4]
  };
});
// CBO's own published 2022 group minimums (household size 2) — the anchor for the
// AGI-class -> CBO-group crosswalk. Disclosed in the UI as an approximation.
{
  const m = cbo.income_group_minimums.data['household size 2'].find(r => r[0] === YR);
  if (!m) fail('CBO income_group_minimums has no 2022 row for household size 2');
  cboOut.mins = { second: m[2], middle: m[3], fourth: m[4], highest: m[5], top1: m[9], basis: 'household size 2, 2022 dollars' };
}

/* ------------------------------------------- the 37% bracket start, TY2023 */
// Added to data/ in Phase 2 (IRS Rev. Proc. 2022-38, verbatim quote in the file).
// The top-rate lever needs it to compute income ABOVE a user-chosen threshold
// rather than all income already in the top bracket.
const bracketStart = (function () {
  const b = hist.bracket_thresholds_ty2023;
  if (!b || !b.married_filing_jointly || !b.married_filing_jointly.value)
    fail('history-series.json is missing bracket_thresholds_ty2023');
  return { mfj: b.married_filing_jointly.value, single: b.unmarried.value, s: b.source, u: b.url, use: b.engine_use };
})();

/* ------------------------------------------------------------ SOI top-1% */
const soiTop1Floor = (() => {
  const r = soiP.agi_floor_current_dollars.find(x => x[0] === 2023);
  return r ? r[5] : fail('SOI top-1% AGI floor missing for 2023');
})();

/* --------------------------------------------------------------- Scores  */
// Each entry: v = value (usd_billions over `w`), plus provenance. Copied verbatim
// from expenditures.json / scenarios.json — no arithmetic applied here.
const cs = exp.conv_scores;
const scores = {
  tax_gains_at_death:  { v: cs.tax_gains_at_death.value,  w: cs.tax_gains_at_death.window,  b: cs.tax_gains_at_death.baseline,  s: 'CBO Budget Option 51 (Dec 2024)', u: cs.tax_gains_at_death.url },
  carryover_basis:     { v: cs.carryover_basis_only.value, w: cs.carryover_basis_only.window, b: cs.carryover_basis_only.baseline, s: 'CBO Budget Option 51 (Dec 2024)', u: cs.carryover_basis_only.url },
  health_p75:          { v: cs.employer_health_exclusion_cap.alternatives[0].value, w: cs.employer_health_exclusion_cap.window, b: cs.employer_health_exclusion_cap.baseline, s: 'CBO Budget Option 56 (Dec 2024) — income + payroll, 75th pctile of premiums', u: cs.employer_health_exclusion_cap.url },
  health_p50:          { v: cs.employer_health_exclusion_cap.alternatives[1].value, w: cs.employer_health_exclusion_cap.window, b: cs.employer_health_exclusion_cap.baseline, s: 'CBO Budget Option 56 (Dec 2024) — income + payroll, 50th pctile of premiums', u: cs.employer_health_exclusion_cap.url },
  health_p50_inc:      { v: cs.employer_health_exclusion_cap.alternatives[2].value, w: cs.employer_health_exclusion_cap.window, b: cs.employer_health_exclusion_cap.baseline, s: 'CBO Budget Option 56 (Dec 2024) — income tax only, 50th pctile', u: cs.employer_health_exclusion_cap.url },
  repeal_199a:         { v: cs.repeal_199a.value, dyn: cs.repeal_199a.dynamic, w: cs.repeal_199a.window, b: cs.repeal_199a.baseline, s: 'Tax Foundation 2026 Options Guide', u: cs.repeal_199a.url },
  repeal_mid:          { v: cs.repeal_mortgage_interest_deduction.value, w: cs.repeal_mortgage_interest_deduction.window, b: cs.repeal_mortgage_interest_deduction.baseline, s: 'CRS IF13190 (Mar 2026), Yale Budget Lab model — CRS states these are not official scoring estimates', u: cs.repeal_mortgage_interest_deduction.url },
  muni_private:        { v: cs.muni_bonds_new_issues.value, w: cs.muni_bonds_new_issues.window, b: cs.muni_bonds_new_issues.baseline, s: 'CBO Budget Option 52 (Dec 2024) — PRIVATE ACTIVITY bonds only', u: cs.muni_bonds_new_issues.url },
  salt_eliminate:      { v: 1143.2, w: 'FY2023-2032', b: 'pre-obbba', s: 'CBO Budget Options, prior (2023-2032) vintage — the current-window per-alternative split did not extract; see expenditures.json > conv_scores.eliminate_itemized_deductions', u: cs.eliminate_itemized_deductions.url },
  carried_interest:    { v: exp.avoidance_mechanics.carried_interest.yale_2026.value, alt: exp.avoidance_mechanics.carried_interest.yale_2026.old_method, w: '10 years (2026 vintage)', b: 'post-obbba', s: 'Yale Budget Lab (May 2026)', u: exp.avoidance_mechanics.carried_interest.yale_2026.url },
  crypto_wash:         { v: exp.avoidance_mechanics.crypto_wash_sales.value, w: '10 years (2021 vintage)', b: 'pre-obbba', s: 'Tax Policy Center Briefing Book citing JCT', u: exp.avoidance_mechanics.crypto_wash_sales.url },
  payroll_donut250k:   { v: scen.scrap_the_payroll_cap.cbo_options.alternatives[1].value, w: scen.scrap_the_payroll_cap.cbo_options.window, b: 'pre-obbba', s: 'CBO Budget Option 60955 (Dec 2024) — $250,000 threshold, net of an income/payroll tax offset', u: scen.scrap_the_payroll_cap.cbo_options.url },
  payroll_90pct:       { v: scen.scrap_the_payroll_cap.cbo_options.alternatives[0].value, w: scen.scrap_the_payroll_cap.cbo_options.window, b: 'pre-obbba', s: 'CBO Budget Option 60955 (Dec 2024) — raise the taxable share of earnings to 90%', u: scen.scrap_the_payroll_cap.cbo_options.url },
  vat_broad:           { v: scen.add_a_vat.alternatives[0].value, w: scen.add_a_vat.window, b: scen.add_a_vat.baseline, s: 'CBO Budget Option 60961 (Dec 2024) — 5% VAT, broad base', u: scen.add_a_vat.url },
  vat_narrow:          { v: scen.add_a_vat.alternatives[1].value, w: scen.add_a_vat.window, b: scen.add_a_vat.baseline, s: 'CBO Budget Option 60961 (Dec 2024) — 5% VAT, narrower base', u: scen.add_a_vat.url },
  ftt:                 { v: scen.financial_transaction_tax.value, w: scen.financial_transaction_tax.window, b: scen.financial_transaction_tax.baseline, s: 'CBO, Impose a Tax on Financial Transactions (Dec 2018) — dropped from CBO’s Dec 2024 volume', u: scen.financial_transaction_tax.url },
  irs_restore:         { v: exp.enforcement.yale_total_revenue_loss.value, w: exp.enforcement.yale_total_revenue_loss.window, b: 'post-obbba', s: 'Yale Budget Lab (Apr 2026), revenue lost to enacted IRS staffing and budget cuts', u: exp.enforcement.yale_total_revenue_loss.url },
  irs_rescind20b:      { v: -exp.enforcement.cbo_rescission.revenue_loss, w: exp.enforcement.cbo_rescission.window, b: 'pre-obbba', s: 'CBO (Feb 2024): a $20B rescission reduces revenues by $44B and raises the deficit by $24B', u: exp.enforcement.cbo_rescission.url }
};
// Wealth tax: three attributions, never averaged.
const wealth = {
  saez_zucman: { v: scen.wealth_tax.warren.estimates[0].value, w: scen.wealth_tax.warren.estimates[0].window, s: 'Saez & Zucman (Jan 2019), 2%/+1% Warren design', u: scen.wealth_tax.warren.estimates[0].url },
  pwbm:        { v: scen.wealth_tax.warren.estimates[1].conventional_2023_2032, w: '2023-2032', s: 'Penn Wharton Budget Model (Mar 2021), conventional', u: scen.wealth_tax.warren.estimates[1].url },
  summers_sarin: { annualLo: scen.wealth_tax.warren.estimates[2].annual_range[0], annualHi: scen.wealth_tax.warren.estimates[2].annual_range[1], s: 'Summers & Sarin (Jun 2019) — published as an explicitly back-of-envelope ANNUAL range; the authors give no ten-year total', u: scen.wealth_tax.warren.estimates[2].url }
};
// FairTax: rate-framing and revenue-neutral rates.
const fairtax = {
  inclusive: scen.fairtax.rate_framing.tax_inclusive,
  exclusive: scen.fairtax.rate_framing.tax_exclusive,
  neutralInclusive: scen.fairtax.revenue_neutral_rate.gale_pomerleau[1].inclusive,
  neutralExclusive: scen.fairtax.revenue_neutral_rate.gale_pomerleau[1].exclusive,
  deficitAt23: scen.fairtax.revenue_neutral_rate.deficit_impact_at_23pct,
  shareLower80Now: scen.fairtax.distribution.table[0].share_of_federal_income_taxes_current,
  shareLower80Nrst: scen.fairtax.distribution.table[0].share_of_federal_sales_taxes_nrst,
  shareTop20Now: scen.fairtax.distribution.table[1].share_of_federal_income_taxes_current,
  shareTop20Nrst: scen.fairtax.distribution.table[1].share_of_federal_sales_taxes_nrst,
  s: 'Brookings (Gale & Pomerleau, Mar 2023) for rates; TPC Briefing Book summarising the 2005 President’s Advisory Panel for distribution (modelled at a 22% rate, 2006 dollars)',
  u: scen.fairtax.rate_framing.url
};
// Flat tax: the published comparison score (our own flat-tax figure is computed
// from the SOI base at run time; this is what a published scorer produced).
const flatPublished = {
  v: scen.flat_tax.revenue.value, w: scen.flat_tax.revenue.window, b: scen.flat_tax.revenue.baseline,
  s: 'Tax Policy Center (Feb 2016), the Cruz plan — a 10% individual flat tax PAIRED with a 16% subtraction-method business tax, i.e. a VAT in substance. Scored on a pre-TCJA and pre-OBBBA baseline.',
  u: scen.flat_tax.revenue.url,
  dist: scen.flat_tax.distribution.table.map(r => [r.group, r.pct_change_after_tax_income])
};

/* ---------------------------------------------- distributional share keys */
const ds = exp.distributional_shares;
const shares = {
  capgains:  { highest: ds.preferential_capital_gains_rates.highest_quintile, top1: ds.preferential_capital_gains_rates.top_1pct, s: 'CBO, The Distribution of Major Tax Expenditures in 2019', u: ds._url },
  health:    { highest: ds.employer_health_exclusion.highest_quintile, fourth: ds.employer_health_exclusion.fourth_quintile, middle: ds.employer_health_exclusion.middle_quintile, bottomTwo: ds.employer_health_exclusion.bottom_two_combined, top1: null, s: 'CBO, The Distribution of Major Tax Expenditures in 2019', u: ds._url },
  mortgage:  { highest: ds.mortgage_interest.highest_quintile, top1: ds.mortgage_interest.top_1pct, s: 'CBO, The Distribution of Major Tax Expenditures in 2019', u: ds._url },
  s199a:     { topDecile: ds.section_199a.use_this_instead.value, s: 'JCT (Dec 2024, transmitted Jun 2025) — top AGI decile, AGI at least $174,000. NOT the top 1%.', u: ds.section_199a.use_this_instead.url }
};

/* --------------------------------------------------------- Act 2 params  */
const params = {
  eti: {
    range: par.eti.range, central: par.eti.central,
    top: par.eti.top_earners.value, topBroad: par.eti.top_earners.broad_base_alternative,
    sSSG: 'Saez, Slemrod & Giertz, JEL 2012 — "the best available estimates range from 0.12 to 0.40"; the authors add "there are no truly convincing estimates of the long-run elasticity."',
    uSSG: par.eti.primary_url,
    sDS: 'Diamond & Saez, JEP 2011 — 0.57 on the current taxable-income base vs 0.17 on a broad base.',
    uDS: par.eti.top_earners.url,
    coupling: 'Saez/Slemrod/Giertz: "the ETI can be thought of as a policy choice." Diamond & Saez: the avoidance component "is not an immutable parameter and can be reduced through base broadening and tax enforcement."',
    notLabor: par.eti.what_it_measures.note
  },
  tauStar: { a: par.revenue_maximizing_top_rate.pareto_parameter_a, label: par.revenue_maximizing_top_rate.critical_labeling_requirement, s: 'Diamond & Saez, JEP 2011, tau* = 1/(1 + a*e), a = 1.5', u: par.revenue_maximizing_top_rate.url, critique: par.revenue_maximizing_top_rate.credible_critique.value, critiqueSrc: 'Badel, Huggett & Luo, Economic Journal 2020 — approximately 49% in their human-capital model', critiqueUrl: par.revenue_maximizing_top_rate.credible_critique.url, neverClaim: par.revenue_maximizing_top_rate.never_claim },
  cg: {
    persistent: par.capital_gains_realization_elasticity.persistent.value,
    lowRegime: par.capital_gains_realization_elasticity.agersnap_zidar_alternative.revenue_elasticity[1],
    sPersistent: 'Dowd, McClelland & Muthitacharoen, National Tax Journal 68(3) 2015 — preferred persistent elasticity -0.72. (Cite the 2015 NTJ version, not the CBO working paper, which says -0.79.)',
    uPersistent: par.capital_gains_realization_elasticity.persistent.url,
    sLow: 'Agersnap & Zidar, NBER w27705 (2020) — ten-year revenue elasticity of -0.5 to -0.3; long-run revenue-maximizing rates of 38-47%. This is a REVENUE elasticity, not a realizations elasticity, and is not directly comparable to -0.72 without conversion.',
    uLow: par.capital_gains_realization_elasticity.agersnap_zidar_alternative.url,
    stepUpMech: par.capital_gains_realization_elasticity.step_up_interaction.quote_mechanism,
    stepUpExtra: par.capital_gains_realization_elasticity.step_up_interaction.additional_revenue.value,
    uStepUp: par.capital_gains_realization_elasticity.step_up_interaction.url,
    scorekeeper: par.capital_gains_realization_elasticity.scorekeeper_rev_max_rate.value,
    azRevMax: par.capital_gains_realization_elasticity.agersnap_zidar_alternative.rev_max_rate
  },
  mult: {
    cboLowMid: par.fiscal_multipliers.cbo_arra_table.rows.find(r => /Lower- and Middle-Income/.test(r.provision)),
    cboHigh:   par.fiscal_multipliers.cbo_arra_table.rows.find(r => /Higher-Income/.test(r.provision)),
    cboTransfer: par.fiscal_multipliers.cbo_arra_table.rows.find(r => /Transfer Payments to Individuals/.test(r.provision)),
    cboCorp:   par.fiscal_multipliers.cbo_arra_table.rows.find(r => /Corporate Tax Provisions/.test(r.provision)),
    sCbo: 'CBO, Estimated Impact of ARRA (May 2012) — published as LOW/HIGH BOUNDS, not central estimates.',
    uCbo: par.fiscal_multipliers.cbo_arra_table.url,
    contested: par.fiscal_multipliers.state_dependence.verdict,
    supports: { s: par.fiscal_multipliers.state_dependence.supports.source, u: par.fiscal_multipliers.state_dependence.supports.url },
    rejects:  { s: par.fiscal_multipliers.state_dependence.rejects.source,  u: par.fiscal_multipliers.state_dependence.rejects.url, q: 'multipliers "below unity irrespective of the amount of slack in the economy"' },
    resolution: par.fiscal_multipliers.state_dependence.resolution
  },
  mpc: {
    jpLow: par.mpc.heterogeneity.verified.richest, jpHigh: par.mpc.heterogeneity.verified.lowest_cash_on_hand,
    jpMean: par.mpc.heterogeneity.verified.mean,
    sJP: 'Jappelli & Pistaferri, AEJ: Macro 2014 — 65% at the lowest cash-on-hand percentile falling to 30% for the richest, 48% on average. ITALIAN survey data on HYPOTHETICAL responses.',
    uJP: par.mpc.heterogeneity.url,
    fedByWealthQuintile: par.mpc.heterogeneity.corroborating.by_wealth_quintile,
    sFed: 'Fisher et al., Boston Fed WP 19-4 — the authors flag their own estimates as "at the low end of the range examined in other research." Quintiles are by WEALTH, which does not map cleanly onto income.',
    uFed: par.mpc.heterogeneity.corroborating.url,
    verdict: par.mpc.heterogeneity.verdict
  },
  incidence: {
    def: par.corporate_incidence.default, range: par.corporate_incidence.slider_range,
    headline: par.corporate_incidence.headline,
    shops: par.corporate_incidence.shops.map(s => ({ shop: s.shop, labor: s.labor != null ? s.labor : s.labor_most_likely, u: s.url, caveat: s.caveat || null }))
  },
  feedback: {
    range: par.growth_feedback.verified_range,
    cbo2005first: par.growth_feedback.anchors[0].value,
    cbo2005second: par.growth_feedback.anchors[1].value,
    cboBoth: par.growth_feedback.anchors[2].value,
    galeAvg: par.growth_feedback.anchors[4].value,
    galeExTf: par.growth_feedback.anchors[4].excluding_tax_foundation,
    crfbExt: par.growth_feedback.anchors[5].value,
    crfbByShop: par.growth_feedback.anchors[5].by_shop,
    selfFinanceQuote: par.growth_feedback.intuition_pump.quote,
    selfFinanceUrl: par.growth_feedback.intuition_pump.url,
    neverClaim: par.growth_feedback.never_claim,
    uCbo2005: par.growth_feedback.anchors[0].url,
    uGale: par.growth_feedback.anchors[4].url,
    uCrfb: par.growth_feedback.anchors[5].url
  },
  lesson: par.tcja_four_scores.the_lesson
};

/* ------------------------------------------------------------- baseline  */
const baseline = {
  receipts: {
    individual: base.receipts.individual_income_tax.value,
    payroll: base.receipts.payroll_social_insurance.value,
    corporate: base.receipts.corporate_income_tax.value,
    customs: base.receipts.customs_duties.value,
    excise: base.receipts.excise_taxes.value,
    estate: base.receipts.estate_and_gift_taxes.value,
    misc: base.receipts.miscellaneous_receipts.value,
    total: base.receipts.total.value,
    pctGdp: base.receipts.total_pct_gdp.value,
    period: 'FY2025', s: 'OMB, FY2027 Analytical Perspectives Table 08-1', u: base.receipts.total.url
  },
  gdp: { fy2025: base.gdp.fy2025_nominal.value, proj2026: base.gdp.cbo_2026_projected.value, pointOfGdp: base.derived.point_of_gdp.value, s: 'CBO, The Budget and Economic Outlook: 2026 to 2036', u: base.gdp.cbo_2026_projected.url },
  deficit: { v: base.deficit.value, pctGdp: base.deficit.pct_gdp.value, s: 'CBO, Monthly Budget Review: FY2025 final', u: base.deficit.url }
};

/* -------------------------------------------------- payroll cap variants */
const payroll = {
  cap2026: scen.scrap_the_payroll_cap.current_cap['2026'],
  cap2025: scen.scrap_the_payroll_cap.current_cap['2025'],
  capUrl: scen.scrap_the_payroll_cap.current_cap.url,
  ssa: scen.scrap_the_payroll_cap.ssa_solvency.provisions.map(p => ({ id: p.id, d: p.description, pct: p.pct_of_deficit_closed, payroll: p.pct_of_payroll })),
  ssaSrc: 'SSA Office of the Chief Actuary, provisions summary, 2025 Trustees Report basis',
  ssaUrl: scen.scrap_the_payroll_cap.ssa_solvency.url,
  loadBearing: scen.scrap_the_payroll_cap.ssa_solvency.the_load_bearing_finding
};

/* ----------------------------------------------------------- enforcement */
const enforcement = {
  auditRoiTop: exp.enforcement.audit_roi.value,
  auditRoiBelowMedian: exp.enforcement.audit_roi.below_median,
  auditSrc: 'Boning, Hendren, Sprung-Keyser & Stuart, NBER w31376 / QJE 2025',
  auditUrl: exp.enforcement.audit_roi.url,
  auditCaveat: exp.enforcement.audit_roi.note,
  taxGapGross: exp.tax_gap.gross.value, taxGapNet: exp.tax_gap.net.value,
  taxGapPeriod: exp.tax_gap._period, taxGapUrl: exp.tax_gap._url,
  visibility: exp.tax_gap.visibility_ladder.rows.map(r => [r.visibility, r.gap_billions, r.misreporting_rate_pct != null ? r.misreporting_rate_pct : null]),
  contested: exp.enforcement.why_this_is_a_first_class_lever
};

/* ------------------------------------------------------ static exposures */
const se = exp.static_expenditures;
const statics = {
  capgains: se.preferential_capital_gains_dividends.value,
  health: se.employer_health_exclusion_income.value,
  stepUp: se.stepped_up_basis.value,
  s199a: se.section_199a.value,
  salt: se.salt_deduction.value,
  mortgageAnnual: se.mortgage_interest.annual_average,
  retirement: se.retirement_savings.value,
  charitable: se.charitable_deduction.value,
  period: 'FY2026 (mortgage: FY2025-2029 five-year total, averaged)',
  s: 'JCT JCX-45-25 (Dec 2025) via CRFB and Novogradac',
  total: exp.anchor_fact.total_fy2026.value
};

/* -------------------------------------------------------------- SPM      */
const spm = { data: arrs.spm_poverty.data, s: 'U.S. Census Bureau, CPS ASEC', caveat: 'Census warns the SPM is revised and "comparisons over time should be made with caution"; method breaks at 2013, 2017 and 2020-21.' };


/* ------------------------------------------------------------------ Act 3 */
// Scenario-card figures. Every entry is a PATH into learn/tax-explorer/data/;
// the value is read out of the file, never retyped here. scripts/tax-explorer/
// test-model.js case 17 re-resolves the same paths against the same files, so a
// figure that drifts from its source fails mechanically rather than by eye.
const CARD_FILES = { scenarios: scen, expenditures: exp, 'series-arrays': arrs };
function pick(file, dotted) {
  const root = CARD_FILES[file];
  if (!root) fail(`unknown data file "${file}" in the Act 3 card table`);
  const v = dotted.split('.').reduce((o, k) => (o === undefined || o === null) ? undefined
    : (/^\d+$/.test(k) ? o[Number(k)] : o[k]), root);
  if (v === undefined) fail(`Act 3 card figure path "${file}.${dotted}" does not resolve`);
  if (v === null) fail(`Act 3 card figure path "${file}.${dotted}" is null — an unsourced datum must never be displayed`);
  return v;
}
// [ id, [ figure, ... ] ] where figure =
//   { label, file, path, unit, period | periodPath, urlPath|url, quotePath?, scorer?, baseline?, note? }
const CARD_FIGURE_TABLE = {
  obbba_baseline: [
    { label: 'Added to the deficit', file: 'scenarios', path: 'obbba_baseline.deficit_effect.value', unit: 'usd_billions',
      periodPath: 'obbba_baseline.deficit_effect.window', urlPath: 'obbba_baseline.deficit_effect.url',
      quotePath: 'obbba_baseline.deficit_effect.quote', scorer: 'CBO', baselinePath: null, baseline: 'post-obbba (this IS the OBBBA score)' },
    { label: 'Lowest decile, share of resources lost', file: 'scenarios', path: 'obbba_baseline.distribution.verified.bottom_decile_pct', unit: 'percent',
      periodPath: 'obbba_baseline.distribution.verified.period', urlPath: 'obbba_baseline.distribution.url',
      quotePath: 'obbba_baseline.distribution.quote', scorer: 'CBO' },
    { label: 'Lowest decile, dollars a year', file: 'scenarios', path: 'obbba_baseline.distribution.verified.bottom_decile_dollars', unit: 'usd_2025',
      periodPath: 'obbba_baseline.distribution.verified.period', urlPath: 'obbba_baseline.distribution.url', scorer: 'CBO' },
    { label: 'Highest decile, share of resources gained', file: 'scenarios', path: 'obbba_baseline.distribution.verified.top_decile_pct', unit: 'percent',
      periodPath: 'obbba_baseline.distribution.verified.period', urlPath: 'obbba_baseline.distribution.url',
      quotePath: 'obbba_baseline.distribution.quote_2', scorer: 'CBO' },
    { label: 'Highest decile, dollars a year', file: 'scenarios', path: 'obbba_baseline.distribution.verified.top_decile_dollars', unit: 'usd_2025',
      periodPath: 'obbba_baseline.distribution.verified.period', urlPath: 'obbba_baseline.distribution.url', scorer: 'CBO' }
  ],
  close_the_loopholes: [
    { label: 'Tax gains at death', file: 'expenditures', path: 'conv_scores.tax_gains_at_death.value', unit: 'usd_billions',
      periodPath: 'conv_scores.tax_gains_at_death.window', urlPath: 'conv_scores.tax_gains_at_death.url',
      baselinePath: 'conv_scores.tax_gains_at_death.baseline', scorer: 'CBO Budget Option 51 (Dec 2024)' },
    { label: 'Tax carried interest as ordinary income', file: 'expenditures', path: 'avoidance_mechanics.carried_interest.yale_2026.value', unit: 'usd_billions',
      period: '10 years (2026 vintage)', urlPath: 'avoidance_mechanics.carried_interest.yale_2026.url',
      baseline: 'post-obbba', scorer: 'Yale Budget Lab (May 2026)' },
    { label: 'Repeal the 199A pass-through deduction', file: 'expenditures', path: 'conv_scores.repeal_199a.value', unit: 'usd_billions',
      periodPath: 'conv_scores.repeal_199a.window', urlPath: 'conv_scores.repeal_199a.url',
      baselinePath: 'conv_scores.repeal_199a.baseline', scorer: 'Tax Foundation 2026 Options Guide' },
    { label: 'Limit or eliminate itemized deductions — CBO\u2019s range, low end', file: 'expenditures', path: 'conv_scores.eliminate_itemized_deductions.value_range.0', unit: 'usd_billions',
      periodPath: 'conv_scores.eliminate_itemized_deductions.window', urlPath: 'conv_scores.eliminate_itemized_deductions.url',
      baselinePath: 'conv_scores.eliminate_itemized_deductions.baseline', scorer: 'CBO Budget Option 49 (Dec 2024)',
      noteP: 'conv_scores.eliminate_itemized_deductions.note' },
    { label: 'Limit or eliminate itemized deductions — CBO\u2019s range, high end', file: 'expenditures', path: 'conv_scores.eliminate_itemized_deductions.value_range.1', unit: 'usd_billions',
      periodPath: 'conv_scores.eliminate_itemized_deductions.window', urlPath: 'conv_scores.eliminate_itemized_deductions.url',
      baselinePath: 'conv_scores.eliminate_itemized_deductions.baseline', scorer: 'CBO Budget Option 49 (Dec 2024)',
      quotePath: 'conv_scores.eliminate_itemized_deductions.quote' },
    { label: 'Revenue lost to the IRS cuts already made', file: 'expenditures', path: 'enforcement.yale_total_revenue_loss.value', unit: 'usd_billions',
      periodPath: 'enforcement.yale_total_revenue_loss.window', urlPath: 'enforcement.yale_total_revenue_loss.url',
      baseline: 'post-obbba', scorer: 'Yale Budget Lab (Apr 2026)' }
  ],
  seventy_percent_top_rate: [
    { label: 'Tax Foundation, ordinary income only, conventional', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.0.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.0.window', urlPath: 'seventy_percent_top_rate.estimates.0.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Tax Foundation' },
    { label: 'Tax Foundation, ordinary income only, dynamic', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.1.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.1.window', urlPath: 'seventy_percent_top_rate.estimates.0.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Tax Foundation' },
    { label: 'Tax Foundation, INCLUDING capital gains, conventional', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.2.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.2.window', urlPath: 'seventy_percent_top_rate.estimates.0.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Tax Foundation' },
    { label: 'Tax Foundation, INCLUDING capital gains, dynamic', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.3.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.3.window', urlPath: 'seventy_percent_top_rate.estimates.0.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Tax Foundation' },
    { label: 'Penn Wharton, static', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.4.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.4.window', urlPath: 'seventy_percent_top_rate.estimates.4.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Penn Wharton Budget Model' },
    { label: 'Penn Wharton, business income shifting, full deferral', file: 'scenarios', path: 'seventy_percent_top_rate.estimates.7.value', unit: 'usd_billions',
      periodPath: 'seventy_percent_top_rate.estimates.7.window', urlPath: 'seventy_percent_top_rate.estimates.4.url',
      baselinePath: 'seventy_percent_top_rate.baseline', scorer: 'Penn Wharton Budget Model' }
  ],
  wealth_tax: [
    { label: 'Saez & Zucman, 2% above $50M plus 1% above $1B', file: 'scenarios', path: 'wealth_tax.warren.estimates.0.value', unit: 'usd_billions',
      periodPath: 'wealth_tax.warren.estimates.0.window', urlPath: 'wealth_tax.warren.estimates.0.url',
      quotePath: 'wealth_tax.warren.estimates.0.quote', scorer: 'Saez & Zucman (Jan 2019)' },
    { label: 'Penn Wharton, conventional, matched 2023-2032 window', file: 'scenarios', path: 'wealth_tax.warren.estimates.1.conventional_2023_2032', unit: 'usd_billions',
      period: '2023-2032', urlPath: 'wealth_tax.warren.estimates.1.url', scorer: 'Penn Wharton Budget Model (Mar 2021)' },
    { label: 'Penn Wharton, conventional, standard 2022-2031 window', file: 'scenarios', path: 'wealth_tax.warren.estimates.1.conventional_2022_2031', unit: 'usd_billions',
      period: '2022-2031', urlPath: 'wealth_tax.warren.estimates.1.url',
      quotePath: 'wealth_tax.warren.estimates.1.quote', scorer: 'Penn Wharton Budget Model (Mar 2021)' },
    { label: 'Summers & Sarin, annual, low end', file: 'scenarios', path: 'wealth_tax.warren.estimates.2.annual_range.0', unit: 'usd_billions_per_year',
      period: 'per year, no ten-year total published', urlPath: 'wealth_tax.warren.estimates.2.url',
      quotePath: 'wealth_tax.warren.estimates.2.quote', scorer: 'Summers & Sarin (Jun 2019)' },
    { label: 'Summers & Sarin, annual, high end', file: 'scenarios', path: 'wealth_tax.warren.estimates.2.annual_range.1', unit: 'usd_billions_per_year',
      period: 'per year, no ten-year total published', urlPath: 'wealth_tax.warren.estimates.2.url',
      quotePath: 'wealth_tax.warren.estimates.2.quote_2', scorer: 'Summers & Sarin (Jun 2019)' },
    { label: 'Norway, wealth-tax revenue in 2022', file: 'scenarios', path: 'wealth_tax.international_track_record.norway.revenue.2022', unit: 'billion_kroner',
      period: '2022', urlPath: 'wealth_tax.international_track_record.norway.url', scorer: 'AFP wire report off Norwegian government figures' },
    { label: 'Norway, wealth-tax revenue in 2025 (estimated)', file: 'scenarios', path: 'wealth_tax.international_track_record.norway.revenue.2025', unit: 'billion_kroner',
      period: '2025 (estimated)', urlPath: 'wealth_tax.international_track_record.norway.url', scorer: 'AFP wire report off Norwegian government figures' },
    { label: 'Norway, multimillionaires and billionaires who left for Switzerland', file: 'scenarios', path: 'wealth_tax.international_track_record.norway.emigration.value', unit: 'count',
      periodPath: 'wealth_tax.international_track_record.norway.emigration.period', urlPath: 'wealth_tax.international_track_record.norway.url',
      scorer: 'AFP wire report' },
    { label: 'Switzerland, wealth-tax revenue', file: 'scenarios', path: 'wealth_tax.international_track_record.switzerland.value', unit: 'percent_of_gdp',
      period: 'as reported 2019', urlPath: 'wealth_tax.international_track_record.switzerland.url',
      quotePath: 'wealth_tax.international_track_record.switzerland.quote', scorer: 'OECD via PolitiFact' }
  ],
  flat_tax: [
    { label: 'Ten-year revenue effect of the Cruz plan', file: 'scenarios', path: 'flat_tax.revenue.value', unit: 'usd_billions',
      periodPath: 'flat_tax.revenue.window', urlPath: 'flat_tax.revenue.url', quotePath: 'flat_tax.revenue.quote',
      baselinePath: 'flat_tax.revenue.baseline', scorer: 'Tax Policy Center (Feb 2016)' },
    { label: 'Lowest quintile, change in after-tax income', file: 'scenarios', path: 'flat_tax.distribution.table.0.pct_change_after_tax_income', unit: 'percent',
      periodPath: 'flat_tax.distribution.period', urlPath: 'flat_tax.revenue.url', scorer: 'Tax Policy Center' },
    { label: 'Middle quintile, change in after-tax income', file: 'scenarios', path: 'flat_tax.distribution.table.2.pct_change_after_tax_income', unit: 'percent',
      periodPath: 'flat_tax.distribution.period', urlPath: 'flat_tax.revenue.url', scorer: 'Tax Policy Center' },
    { label: 'Top 1 percent, change in after-tax income', file: 'scenarios', path: 'flat_tax.distribution.table.5.pct_change_after_tax_income', unit: 'percent',
      periodPath: 'flat_tax.distribution.period', urlPath: 'flat_tax.revenue.url', scorer: 'Tax Policy Center' },
    { label: 'Top 0.1 percent, change in after-tax income', file: 'scenarios', path: 'flat_tax.distribution.table.6.pct_change_after_tax_income', unit: 'percent',
      periodPath: 'flat_tax.distribution.period', urlPath: 'flat_tax.revenue.url', scorer: 'Tax Policy Center' }
  ],
  fairtax: [
    { label: 'Legislated rate, tax-inclusive framing', file: 'scenarios', path: 'fairtax.rate_framing.tax_inclusive', unit: 'percent',
      period: 'H.R. 25 as introduced', urlPath: 'fairtax.rate_framing.url', scorer: 'the bill text' },
    { label: 'The same rate, tax-exclusive framing', file: 'scenarios', path: 'fairtax.rate_framing.tax_exclusive', unit: 'percent',
      period: 'H.R. 25 as introduced', urlPath: 'fairtax.rate_framing.url', scorer: 'the bill text' },
    { label: 'Revenue-neutral rate, tax-inclusive', file: 'scenarios', path: 'fairtax.revenue_neutral_rate.gale_pomerleau.1.inclusive', unit: 'percent',
      period: 'as scored', urlPath: 'fairtax.rate_framing.url', scorer: 'Gale / Pomerleau' },
    { label: 'Revenue-neutral rate, tax-exclusive', file: 'scenarios', path: 'fairtax.revenue_neutral_rate.gale_pomerleau.1.exclusive', unit: 'percent',
      period: 'as scored', urlPath: 'fairtax.rate_framing.url', scorer: 'Gale / Pomerleau' },
    { label: 'Share of the federal tax burden borne by the bottom 80%, today', file: 'scenarios', path: 'fairtax.distribution.table.0.share_of_federal_income_taxes_current', unit: 'percent',
      period: 'as scored', urlPath: 'fairtax.rate_framing.url', scorer: 'as recorded in scenarios.json' },
    { label: 'Share of the federal tax burden borne by the bottom 80% under the FairTax', file: 'scenarios', path: 'fairtax.distribution.table.0.share_of_federal_sales_taxes_nrst', unit: 'percent',
      period: 'as scored', urlPath: 'fairtax.rate_framing.url', scorer: 'as recorded in scenarios.json' }
  ],
  fund_the_irs: [
    { label: 'Return per dollar spent auditing above the 90th percentile', file: 'expenditures', path: 'enforcement.audit_roi.value', unit: 'ratio',
      period: 'TY2010-2014 audits, published 2023', urlPath: 'enforcement.audit_roi.url', scorer: 'Boning, Hendren, Sprung-Keyser & Stuart' },
    { label: 'Revenue lost to the IRS cuts already made', file: 'expenditures', path: 'enforcement.yale_total_revenue_loss.value', unit: 'usd_billions',
      periodPath: 'enforcement.yale_total_revenue_loss.window', urlPath: 'enforcement.yale_total_revenue_loss.url',
      baseline: 'post-obbba', scorer: 'Yale Budget Lab (Apr 2026)' },
    { label: 'Revenue lost to a $20 billion rescission', file: 'expenditures', path: 'enforcement.cbo_rescission.revenue_loss', unit: 'usd_billions',
      periodPath: 'enforcement.cbo_rescission.window', urlPath: 'enforcement.cbo_rescission.url',
      baseline: 'pre-obbba', scorer: 'CBO (Feb 2024)' },
    { label: 'Gross tax gap', file: 'expenditures', path: 'tax_gap.gross.value', unit: 'usd_billions',
      periodPath: 'tax_gap._period', urlPath: 'tax_gap._url', quotePath: 'tax_gap.gross.quote', scorer: 'IRS Publication 5869 (Oct 2024)' }
  ],
  scrap_the_payroll_cap: [
    { label: 'CBO: apply the tax to earnings above $250,000', file: 'scenarios', path: 'scrap_the_payroll_cap.cbo_options.alternatives.1.value', unit: 'usd_billions',
      periodPath: 'scrap_the_payroll_cap.cbo_options.window', urlPath: 'scrap_the_payroll_cap.cbo_options.url',
      baselinePath: 'scrap_the_payroll_cap.cbo_options.baseline', scorer: 'CBO Budget Option 60955 (Dec 2024)' },
    { label: 'CBO: raise the taxable share of earnings to 90 percent', file: 'scenarios', path: 'scrap_the_payroll_cap.cbo_options.alternatives.0.value', unit: 'usd_billions',
      periodPath: 'scrap_the_payroll_cap.cbo_options.window', urlPath: 'scrap_the_payroll_cap.cbo_options.url',
      baselinePath: 'scrap_the_payroll_cap.cbo_options.baseline', scorer: 'CBO Budget Option 60955 (Dec 2024)' },
    { label: 'SSA E2.1 — no benefit credit: share of the 75-year shortfall closed', file: 'scenarios', path: 'scrap_the_payroll_cap.ssa_solvency.provisions.0.pct_of_deficit_closed', unit: 'percent',
      periodPath: 'scrap_the_payroll_cap.ssa_solvency.basis', urlPath: 'scrap_the_payroll_cap.ssa_solvency.url', scorer: 'SSA Office of the Chief Actuary' },
    { label: 'SSA E2.2 — with benefit credit: share of the 75-year shortfall closed', file: 'scenarios', path: 'scrap_the_payroll_cap.ssa_solvency.provisions.1.pct_of_deficit_closed', unit: 'percent',
      periodPath: 'scrap_the_payroll_cap.ssa_solvency.basis', urlPath: 'scrap_the_payroll_cap.ssa_solvency.url', scorer: 'SSA Office of the Chief Actuary' },
    { label: 'The 2026 taxable maximum', file: 'scenarios', path: 'scrap_the_payroll_cap.current_cap.2026', unit: 'usd',
      period: '2026', urlPath: 'scrap_the_payroll_cap.current_cap.url',
      quotePath: 'scrap_the_payroll_cap.current_cap.quote_2026', scorer: 'SSA Office of the Chief Actuary' }
  ],
  restore_2021_ctc: [
    { label: 'What JCT scored the one-year expansion at', file: 'scenarios', path: 'restore_2021_ctc.cost.value', unit: 'usd_billions',
      periodPath: 'restore_2021_ctc.cost.period', urlPath: 'restore_2021_ctc.cost.url',
      quotePath: 'restore_2021_ctc.cost.quote', baselinePath: 'restore_2021_ctc.cost.baseline', scorer: 'JCT, via the American Action Forum' },
    { label: 'Child poverty (SPM) in 2020, before the expansion', file: 'scenarios', path: 'restore_2021_ctc.child_poverty_series.points.0.value', unit: 'percent',
      period: '2020', urlPath: 'restore_2021_ctc.child_poverty_series.points.0.url',
      quotePath: 'restore_2021_ctc.child_poverty_series.points.0.quote', scorer: 'U.S. Census Bureau' },
    { label: 'Child poverty (SPM) in 2021, with the expansion', file: 'scenarios', path: 'restore_2021_ctc.child_poverty_series.points.1.value', unit: 'percent',
      period: '2021', urlPath: 'restore_2021_ctc.child_poverty_series.points.1.url',
      quotePath: 'restore_2021_ctc.child_poverty_series.points.1.quote', scorer: 'U.S. Census Bureau' },
    { label: 'Child poverty (SPM) in 2022, after it lapsed', file: 'scenarios', path: 'restore_2021_ctc.child_poverty_series.points.2.value', unit: 'percent',
      period: '2022', urlPath: 'restore_2021_ctc.child_poverty_series.points.2.url',
      quotePath: 'restore_2021_ctc.child_poverty_series.points.2.quote', scorer: 'U.S. Census Bureau' },
    { label: 'Child poverty (SPM) in 2023', file: 'scenarios', path: 'restore_2021_ctc.child_poverty_series.points.3.value', unit: 'percent',
      period: '2023', urlPath: 'restore_2021_ctc.child_poverty_series.points.3.url',
      quotePath: 'restore_2021_ctc.child_poverty_series.points.3.quote', scorer: 'U.S. Census Bureau' },
    { label: 'Child poverty (SPM) in 2024', file: 'scenarios', path: 'restore_2021_ctc.child_poverty_series.points.4.value', unit: 'percent',
      period: '2024', urlPath: 'restore_2021_ctc.child_poverty_series.points.4.url',
      quotePath: 'restore_2021_ctc.child_poverty_series.points.4.quote', scorer: 'ITEP (secondary)' },
    { label: 'The credit today', file: 'scenarios', path: 'restore_2021_ctc.current_law.amount.value', unit: 'usd',
      periodPath: 'restore_2021_ctc.current_law.amount.period', urlPath: 'restore_2021_ctc.current_law.amount.url',
      quotePath: 'restore_2021_ctc.current_law.amount.quote', scorer: 'IRS Revenue Procedure 2025-32' },
    { label: 'How much of it a family with no tax liability can actually receive', file: 'scenarios', path: 'restore_2021_ctc.current_law.refundable.value', unit: 'usd',
      periodPath: 'restore_2021_ctc.current_law.refundable.period', urlPath: 'restore_2021_ctc.current_law.refundable.url',
      quotePath: 'restore_2021_ctc.current_law.refundable.quote', scorer: 'IRS Revenue Procedure 2025-32' },
    { label: 'Corinth, Meyer, Stadnicki & Wu: predicted fall in employment', file: 'scenarios', path: 'restore_2021_ctc.employment_dispute.predicted.value', unit: 'millions_of_workers',
      periodPath: 'restore_2021_ctc.employment_dispute.predicted.period', urlPath: 'restore_2021_ctc.employment_dispute.predicted.url',
      quotePath: 'restore_2021_ctc.employment_dispute.predicted.quote', scorer: 'Corinth, Meyer, Stadnicki & Wu (simulation)' }
  ],
  housing_vouchers: [
    { label: 'Extra annual cost of serving everyone eligible', file: 'scenarios', path: 'housing_vouchers.cost.value', unit: 'usd_billions',
      periodPath: 'housing_vouchers.cost.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.cost.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'People moved above the poverty line', file: 'scenarios', path: 'housing_vouchers.poverty_effect.people_lifted.value', unit: 'millions_of_people',
      periodPath: 'housing_vouchers.poverty_effect.people_lifted.period', urlPath: 'housing_vouchers.poverty_effect.people_lifted.url',
      quotePath: 'housing_vouchers.poverty_effect.people_lifted.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Poverty rate now', file: 'scenarios', path: 'housing_vouchers.poverty_effect.spm_rate_before.value', unit: 'percent',
      periodPath: 'housing_vouchers.poverty_effect.spm_rate_before.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.poverty_effect.spm_rate_before.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Poverty rate with vouchers for all who qualify', file: 'scenarios', path: 'housing_vouchers.poverty_effect.spm_rate_after.value', unit: 'percent',
      periodPath: 'housing_vouchers.poverty_effect.spm_rate_after.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.poverty_effect.spm_rate_after.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Share of eligible households served today', file: 'scenarios', path: 'housing_vouchers.coverage_gap.share_served.value', unit: 'percent',
      periodPath: 'housing_vouchers.coverage_gap.share_served.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.coverage_gap.share_served.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Households assisted today', file: 'scenarios', path: 'housing_vouchers.coverage_gap.households.current', unit: 'millions_of_households',
      periodPath: 'housing_vouchers.coverage_gap.households.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.coverage_gap.households.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Households assisted if everyone eligible were served', file: 'scenarios', path: 'housing_vouchers.coverage_gap.households.total', unit: 'millions_of_households',
      periodPath: 'housing_vouchers.coverage_gap.households.period', urlPath: 'housing_vouchers.cost.url',
      quotePath: 'housing_vouchers.coverage_gap.households.quote', scorer: 'Urban Institute (Aug 2023)' },
    { label: 'Families offered a long-term subsidy who used a shelter, months 21-32', file: 'scenarios', path: 'housing_vouchers.causal_evidence.rates.long_term_rent_subsidy', unit: 'percent',
      periodPath: 'housing_vouchers.causal_evidence.period', urlPath: 'housing_vouchers.causal_evidence.url',
      quotePath: 'housing_vouchers.causal_evidence.headline_quote', scorer: 'Gubits et al., JPAM 2018 (randomised trial)' },
    { label: 'Families offered usual care who used a shelter, months 21-32', file: 'scenarios', path: 'housing_vouchers.causal_evidence.rates.usual_care', unit: 'percent',
      periodPath: 'housing_vouchers.causal_evidence.period', urlPath: 'housing_vouchers.causal_evidence.url',
      quotePath: 'housing_vouchers.causal_evidence.headline_quote', scorer: 'Gubits et al., JPAM 2018 (randomised trial)' }
  ],
  carbon_tax_and_dividend: [
    { label: 'Opening rate', file: 'scenarios', path: 'carbon_tax_and_dividend.structure.opening_rate', unit: 'usd_per_metric_ton_co2e',
      period: '2019 in Treasury’s modelled schedule', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.quotes.0', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' },
    { label: 'Rate by 2028', file: 'scenarios', path: 'carbon_tax_and_dividend.structure.rate_2028', unit: 'usd_per_metric_ton_co2e',
      period: '2028 in Treasury’s modelled schedule', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.quotes.0', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' },
    { label: 'Gross revenue', file: 'scenarios', path: 'carbon_tax_and_dividend.gross_revenue.value', unit: 'usd_billions',
      periodPath: 'carbon_tax_and_dividend.gross_revenue.window', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.quotes.1', baselinePath: 'carbon_tax_and_dividend.baseline', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' },
    { label: 'Poorest decile, change in after-tax income WITH the rebate', file: 'scenarios', path: 'carbon_tax_and_dividend.incidence.with_rebate.poorest_decile', unit: 'percent',
      period: 'as modelled, WP-115', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.incidence.with_rebate.quote', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' },
    { label: 'Top decile, change in after-tax income WITH the rebate', file: 'scenarios', path: 'carbon_tax_and_dividend.incidence.with_rebate.top_decile', unit: 'percent',
      period: 'as modelled, WP-115', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.incidence.with_rebate.quote', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' },
    { label: 'Lowest decile, change in after-tax income from the tax ALONE', file: 'scenarios', path: 'carbon_tax_and_dividend.incidence.tax_alone_no_rebate.lowest_decile', unit: 'percent',
      period: 'as modelled, WP-115', urlPath: 'carbon_tax_and_dividend.url',
      quotePath: 'carbon_tax_and_dividend.incidence.tax_alone_no_rebate.quote', scorer: 'U.S. Treasury Office of Tax Analysis, WP-115' }
  ],
  tra86_model: [
    { label: 'Top individual rate before', file: 'scenarios', path: 'tra86_model.rates.individual_top.from', unit: 'percent',
      period: '1986', urlPath: 'tra86_model.revenue_neutrality.url', quotePath: 'tra86_model.revenue_neutrality.quote2', scorer: 'CRFB' },
    { label: 'Top individual rate after', file: 'scenarios', path: 'tra86_model.rates.individual_top.to', unit: 'percent',
      period: '1988', urlPath: 'tra86_model.revenue_neutrality.url', quotePath: 'tra86_model.revenue_neutrality.quote2', scorer: 'CRFB' },
    { label: 'Top corporate rate before', file: 'scenarios', path: 'tra86_model.rates.corporate_top.from', unit: 'percent',
      period: '1979-1986', urlPath: 'tra86_model.revenue_neutrality.url', quotePath: 'tra86_model.revenue_neutrality.quote3', scorer: 'CRFB' },
    { label: 'Top corporate rate after', file: 'scenarios', path: 'tra86_model.rates.corporate_top.to', unit: 'percent',
      period: '1988-1992', urlPath: 'tra86_model.revenue_neutrality.url', quotePath: 'tra86_model.revenue_neutrality.quote3', scorer: 'CRFB' },
    { label: 'Size of the swap: individuals cut, corporations raised', file: 'scenarios', path: 'tra86_model.revenue_neutrality.value', unit: 'usd_billions',
      periodPath: 'tra86_model.revenue_neutrality.period', urlPath: 'tra86_model.revenue_neutrality.url',
      quotePath: 'tra86_model.revenue_neutrality.quote', scorer: 'CRFB' }
  ]
};
// Two outputs, on purpose. The page carries values, periods, scorers and caveats;
// the VERBATIM QUOTES are stripped out of the page payload and written to
// act3-provenance.json instead, which is what learn/tax-explorer/methodology.html
// renders. The quotes are the project's proof of work, but they are ~30 KB of it,
// and the tool's own weight budget says they belong on the page built to hold them.
const cardsFull = {};
Object.keys(CARD_FIGURE_TABLE).forEach(id => {
  cardsFull[id] = {
    evidence: pick('scenarios', id + '.evidence_strength'),
    evidencePath: id + '.evidence_strength',
    figures: CARD_FIGURE_TABLE[id].map(f => {
      const out = {
        label: f.label, file: f.file, path: f.path, unit: f.unit,
        value: f.skipValue ? null : pick(f.file, f.path),
        period: f.period !== undefined ? f.period : pick(f.file, f.periodPath),
        url: f.url !== undefined ? f.url : pick(f.file, f.urlPath),
        scorer: f.scorer || null
      };
      if (f.quotePath) out.quote = pick(f.file, f.quotePath);
      if (f.baseline !== undefined) out.baseline = f.baseline;
      else if (f.baselinePath) out.baseline = pick(f.file, f.baselinePath);
      if (f.note) out.note = f.note;
      else if (f.noteP) out.note = pick(f.file, f.noteP);
      return out;
    }).filter(f => f.value !== null)
  };
});
const cards = JSON.parse(JSON.stringify(cardsFull));
// Also strip the source files' own build notes — they are instructions to whoever
// assembles the tool ("DO NOT MIX VINTAGES"), not copy for a visitor. The
// user-facing caveats are written deliberately in act3-cards.js. The file+path
// stay: they are short, and the page shows a reader exactly which line of which
// data file a figure came from.
Object.keys(cards).forEach(id => cards[id].figures.forEach(f => { delete f.quote; delete f.note; }));

/* -------------------------------------------------------------- emit     */
const out = {
  _: 'Act 2 payload. Built by scripts/tax-explorer/build-act2-data.js from learn/tax-explorer/data/. Do not hand-edit.',
  soi, cbo: cboOut, soiTop1Floor, bracketStart, scores, wealth, fairtax, flatPublished, shares,
  params, baseline, payroll, enforcement, statics, spm, cards,
  benchmarks: {
    topRate: scen.validation_benchmarks.top_rate_plus_2pts,
    capGains: scen.validation_benchmarks.capital_gains_plus_5pts,
    s199a: scen.validation_benchmarks.repeal_199a,
    seventy: {
      note: scen.seventy_percent_top_rate.the_teaching_pair,
      groupDef: scen.seventy_percent_top_rate.group_definition,
      estimates: scen.seventy_percent_top_rate.estimates.map(function (e) { return { shop: e.shop, scenario: e.scenario, value: e.value, window: e.window, url: e.url || null }; }),
      drivers: scen.seventy_percent_top_rate.two_things_drive_the_spread
    }
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
// The provenance payload: same figures, WITH the verbatim source lines. Not injected
// into index.html; read by the methodology page and by test-model.js case 17.
const PROV = path.join(__dirname, 'act3-provenance.json');
fs.writeFileSync(PROV, JSON.stringify({
  _: 'Act 3 card provenance. Built by build-act2-data.js from learn/tax-explorer/data/. Not shipped inside index.html; rendered by learn/tax-explorer/methodology.html.',
  cards: cardsFull
}, null, 1));
console.log('act3-provenance.json written: ' + (fs.statSync(PROV).size / 1024).toFixed(1) + ' KB');
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`act2-data.json written: ${kb} KB  (${soi.c.length} AGI classes, ${Object.keys(cboOut.g).length} CBO groups)`);
