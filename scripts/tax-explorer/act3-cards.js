/**
 * act3-cards.js — The Tax Ladder, Act 3: the scenario library.
 *
 * A scenario card is a stored `levers` object plus its published comparison
 * figures. It is NOT a second scoring path. Tapping a card sets the sandbox's
 * controls and lets the Act 2 engine re-render; where the card's published score
 * and the engine's own figure differ, both are shown, labelled.
 *
 * Every number a card displays comes from D.cards, which build-act2-data.js
 * reads out of learn/tax-explorer/data/ by path. Nothing here retypes a figure.
 * scripts/tax-explorer/test-model.js case 17 re-resolves the same paths against
 * the same files, so a drifted figure fails mechanically.
 *
 * Also holds the URL-state codec, because the page and the tests must share it.
 *
 * NOT hand-edited into the page: inject-act2.js splices this exact text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    root.TaxLadderCards = factory(root.TaxLadderModel);
  }
}(typeof self !== 'undefined' ? self : this, function (M) {
'use strict';

var CURRENT_LAW = M.CURRENT_LAW, DEFAULT_ASSUMPTIONS = M.DEFAULT_ASSUMPTIONS;
var clone = M.clone, usd = M.usd;

/* ══════════════════════ canonical lever / assumption shape ═══════════════ */
// Canonical key order, so that encode -> decode is byte-stable and the tests can
// assert identity rather than "equivalent-ish".
function normalizeLevers(L) {
  var out = {};
  Object.keys(CURRENT_LAW).forEach(function (k) {
    if (k === 'loopholes') {
      var lp = {};
      Object.keys(CURRENT_LAW.loopholes).forEach(function (lk) {
        lp[lk] = (L && L.loopholes && L.loopholes[lk] !== undefined) ? L.loopholes[lk] : CURRENT_LAW.loopholes[lk];
      });
      out.loopholes = lp;
    } else {
      out[k] = (L && L[k] !== undefined) ? L[k] : CURRENT_LAW[k];
    }
  });
  return out;
}
function normalizeAssumptions(A) {
  var out = {};
  Object.keys(DEFAULT_ASSUMPTIONS).forEach(function (k) {
    out[k] = (A && A[k] !== undefined) ? A[k] : DEFAULT_ASSUMPTIONS[k];
  });
  return out;
}
function preset(over) { return normalizeLevers(Object.assign(clone(CURRENT_LAW), over || {})); }

/* ══════════════════════════════ URL state ════════════════════════════════ */
// Same pattern as the games' ?seed=: one base64url parameter, no server, no PII.
function b64encode(s) {
  var raw = (typeof Buffer !== 'undefined')
    ? Buffer.from(s, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(s)));
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(s) {
  var raw = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (raw.length % 4) raw += '=';
  return (typeof Buffer !== 'undefined')
    ? Buffer.from(raw, 'base64').toString('utf8')
    : decodeURIComponent(escape(atob(raw)));
}
var STATE_VERSION = 1;
function encodeState(levers, assumptions) {
  return b64encode(JSON.stringify({
    v: STATE_VERSION, l: normalizeLevers(levers), a: normalizeAssumptions(assumptions)
  }));
}
// Returns null — never a half-applied state — on anything it does not recognise.
function decodeState(s) {
  if (typeof s !== 'string' || !s.length) return null;
  if (!/^[A-Za-z0-9\-_]+$/.test(s)) return null;
  var obj;
  try { obj = JSON.parse(b64decode(s)); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object' || obj.v !== STATE_VERSION) return null;
  if (!obj.l || typeof obj.l !== 'object') return null;
  return { levers: normalizeLevers(obj.l), assumptions: normalizeAssumptions(obj.a) };
}

/* ═══════════════════════════════ the library ═════════════════════════════ */
// Order is the gameplan's, with one substitution recorded in the data: the
// "restore pre-TCJA rates" card is MOOT — OBBBA made the TCJA individual
// provisions permanent in July 2025, so there is no extension left to score —
// and the OBBBA baseline card takes its place.
function buildCards(D) {
  var C = D.cards;
  function F(id) {
    var byPath = {};
    (C[id] ? C[id].figures : []).forEach(function (f) { byPath[f.path] = f; });
    return function (p) {
      var f = byPath[p];
      if (!f) throw new Error('Act 3: card ' + id + ' has no figure at ' + p);
      return f;
    };
  }
  function v(id, p) { return F(id)(p).value; }
  function figs(id) { return (C[id] ? C[id].figures : []).slice(); }
  function ev(id) { return C[id].evidence; }
  function evPath(id) { return C[id].evidencePath; }

  var cards = [];

  /* ── 1 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'close_the_loopholes', n: 1, kind: 'engine', group: 'Where the money is',
    title: 'Close the big loopholes',
    whatChanges: 'Tax capital gains at death instead of wiping the gain clean, tax carried interest as ordinary income, repeal the 199A pass-through deduction, end the state and local tax deduction, and restore the enforcement budget.',
    levers: preset({
      stepUp: 'atDeath',
      loopholes: { s199a: true, salt: true, carriedInterest: true },
      enforcement: 100
    }),
    evidence: ev('close_the_loopholes'), evidenceFrom: evPath('close_the_loopholes'),
    figures: figs('close_the_loopholes'),
    why: [
      'Every one of these is money the tax code already forgoes. Nobody has to be persuaded that it exists — the scorekeepers publish what each one costs.',
      'Stepped-up basis is the largest single item here. When an asset passes at death, the unrealised gain is erased for tax purposes, so a fortune held long enough is never taxed on its growth at all. Taxing gains at death is CBO Option 51; carryover basis is the softer version of the same idea.',
      'The 199A deduction and carried interest are both about which label income wears. 199A gives pass-through business income a deduction wage income does not get; carried interest lets a fund manager’s fee be taxed as a capital gain. Neither changes what the money is — only what it is called.',
      'Enforcement is the odd one out: it raises revenue without changing anyone’s legal liability. That is why it is the closest thing to a free lunch in the whole tool, and why its own card carries a caveat.'
    ],
    notes: [
      'Tax expenditures do not sum. Each score is estimated against current law with everything else unchanged; close several at once and each later one is measured against a base the earlier ones already moved, while money pushed off one route runs down the ones still open. The parts add to more than the whole. No scorekeeper has published a score for this package, so the tool shows you the components and shows no total. See note 14.',
      'The components do not share a window or a baseline. They run over FY2023-2032, FY2025-2034, FY2026-2035 and 2027-2036, some scored before OBBBA and some after, by CBO, the Tax Foundation, CRS and the Yale Budget Lab. Each figure below carries its own label.',
      'PTET-SALT — the state workarounds that let pass-through owners deduct state taxes the federal cap was meant to stop — has no separate published score, so it has no control here. It is named in the SALT lever’s own caveat and no number is attached to it.',
      'Three often-cited breaks are missing from this card because no verified revenue score exists for them: 1031 like-kind exchanges, the municipal bond exemption at its familiar size, and mega-Roth caps.'
    ],
    critics: [
      { claim: 'The scores assume the money sits still. It does not.',
        note: 'This is the interaction-effects objection above, and it is correct. It is why the card shows components rather than a headline.' },
      { claim: 'Ending the SALT deduction raises revenue from a broad, partly middle-class base — it is a base-broadener, not a tax on the rich.',
        note: 'CBO scores it as a range across alternatives rather than a point, because the answer depends entirely on which alternative you pick. Both ends are shown.' },
      { claim: 'Taxing gains at death creates liquidity problems for family farms and closely held businesses.',
        note: 'A real design question rather than a scoring dispute: every serious proposal carries exclusions and payment-period provisions, and their size is what would move the score.' }
    ],
    sources: [
      { text: 'CBO Budget Option 51 — tax capital gains at death', url: 'https://www.cbo.gov/budget-options/60943' },
      { text: 'Yale Budget Lab — refining revenue estimates for carried interest', url: 'https://budgetlab.yale.edu/research/refining-revenue-estimates-taxing-carried-interest' },
      { text: 'CBO Budget Options, December 2024 volume', url: 'https://www.cbo.gov/system/files/2024-12/60557-budget-options.pdf' }
    ],
    engineNote: 'The sandbox scores each component from its own published estimate, then applies the behavioural layer once at the package level. The result will not equal the sum of the figures below, and it is not meant to.'
  });

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'seventy_percent_top_rate', n: 2, kind: 'engine', group: 'Tax the top',
    title: 'A 70% rate above $10 million',
    whatChanges: 'Income above $10 million a year is taxed at 70% instead of 37%. Nothing below $10 million changes.',
    levers: preset({ topRate: 70, topRateThreshold: '10m' }),
    variants: [{
      label: 'Now pair it with capital gains',
      levers: preset({ topRate: 70, topRateThreshold: '10m', capGainsRate: 43.4, taxGainsAtDeath: true, stepUp: 'atDeath' }),
      blurb: 'The same 70% rate, plus capital gains at 39.6% statutory (43.4% once the 3.8% investment income tax is counted) and gains taxed at death. Watch the revenue and the elasticity regime both move.'
    }],
    evidence: ev('seventy_percent_top_rate'), evidenceFrom: evPath('seventy_percent_top_rate'),
    figures: figs('seventy_percent_top_rate'),
    why: [
      'A 70% top rate sounds like it should raise an enormous amount. The reason it does not is that very little income arrives at the very top as a salary.',
      'Most income at the top of the distribution is capital gains, and an ordinary-rate lever does not touch capital gains. Tax Foundation scored the same policy twice — ordinary income only, and including gains — and the second score is a fraction of the first. Including gains turns their dynamic score negative outright, because realisations collapse: people simply do not sell.',
      'That single comparison is the realization doctrine in one line. Capital gains are taxed when you choose to sell, so the tax rate on gains is partly a tax on the timing decision, and the timing decision is the most elastic thing in the tax code.',
      'The second driver is legal form. Penn Wharton finds pass-through owners can reincorporate as C corporations when the gap between the two gets wide enough, which changes who is even in the base the rate applies to.'
    ],
    notes: [
      'Every score on this card predates OBBBA. Against a permanent-TCJA baseline, a revenue-raiser at the top would generally score higher, not lower.',
      'The group here is a DOLLAR BAND — taxable income above $10 million — not a percentile. It is not the same set of people as CBO’s top 1%, and the class chart uses CBO’s groups.',
      'The published range on this card runs from a negative number to $382.3 billion. That is not a margin of error. It is four different questions, each with its own score.'
    ],
    critics: [
      { claim: 'A 70% marginal rate would push income offshore, into deferral, and into forms the rate does not reach — the revenue is far smaller than the arithmetic suggests.',
        note: 'The engine agrees, and shows the behavioural offset as its own labelled bar. The dispute is about the size of the offset, not its existence.' },
      { claim: 'The Diamond-Saez revenue-maximising rate of about 73% licenses a 70% federal bracket.',
        note: 'It does not. Their rate is an ALL-IN combined rate across federal, state, payroll and sales taxes, against a US combined top rate of 42.5%. Reading it as a federal bracket overstates the headroom, and the tool shows both numbers side by side every time.' },
      { claim: 'Revenue-maximising is not the same as good.',
        note: 'Correct, and the tool takes no position on where the rate should sit. Badel, Huggett and Luo reach about 49% in a model with human-capital effects the standard formula leaves out; that number is on the page too.' }
    ],
    sources: [
      { text: 'Tax Foundation — the 70% tax proposal', url: 'https://taxfoundation.org/blog/70-tax-proposal/' },
      { text: 'Penn Wharton Budget Model — a 70% top rate and business entity choice', url: 'https://budgetmodel.wharton.upenn.edu/p/2019-01-22-how-a-top-marginal-rate-of-70-would-affect-business-entity-choice/' }
    ],
    engineNote: 'The engine lands near the Tax Foundation’s conventional score for the ordinary-income-only version, from a different base year and a different method. Its figure covers a narrower base and is not uprated for income growth, so it should read low against published scores, and it does.'
  });

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'wealth_tax', n: 3, kind: 'engine', group: 'Tax the top',
    title: 'Tax wealth, not just income',
    whatChanges: 'A 2% annual tax on household net worth above $50 million, plus another 1% above $1 billion. About 75,000 households.',
    levers: preset({ system: 'wealth', wealthScorer: 'saez_zucman' }),
    variants: [
      { label: 'Score it Penn Wharton’s way', levers: preset({ system: 'wealth', wealthScorer: 'pwbm' }),
        blurb: 'A different shop, conventional scoring, a strikingly similar answer.' },
      { label: 'Score it Summers and Sarin’s way', levers: preset({ system: 'wealth', wealthScorer: 'summers_sarin' }),
        blurb: 'The skeptical case: a back-of-envelope annual figure an order of magnitude lower, which its own authors decline to turn into a ten-year total.' }
    ],
    evidence: ev('wealth_tax'), evidenceFrom: evPath('wealth_tax'),
    figures: figs('wealth_tax'),
    why: [
      'A wealth tax is not a tax on income. It is a tax on a stock rather than a flow, which means it reaches fortunes that generate very little taxable income — the reason it is proposed, and the reason it is hard to administer.',
      'The disagreement between the shops is usually described as a factor-of-ten argument. It is not. Saez and Zucman and Penn Wharton land within about $30 billion of each other once you put them on the same ten-year window, which for a multi-trillion-dollar estimate is close agreement.',
      'Summers and Sarin are arguing something different: that the exercise itself cannot be done reliably, because avoidance, valuation and enforcement all sit outside what a conventional score can capture. Their figure is offered as a rough back-of-envelope number and they say so in the piece.',
      'The overall picture is two shops agreeing on the conventional arithmetic and a third disputing whether conventional arithmetic is the right tool. That is a disagreement about method confidence, not about a parameter, and averaging them would erase the actual argument.'
    ],
    notes: [
      'Rate structures differ between versions and change the answer materially. The figures here are the 2019 Saez-Zucman 2%-plus-1% design. The 2021 Ultra-Millionaire Tax Act used a different structure, and a 2019 campaign version went to 6%.',
      'Europe’s record cuts both ways. Norway raised its rate in 2022; by 2024 some 300 multimillionaires and billionaires had left for Switzerland, and revenue still rose. Switzerland, meanwhile, collects more from its wealth tax than any other country. Neither fact settles the argument on its own.',
      'The Norwegian figures come from wire reporting off government numbers, not a peer-reviewed study. They belong on the card as illustration, not as a score.',
      'A commonly cited count — 12 OECD countries with wealth taxes in 1990, three or four by 2018 — could not be verified from a primary source, so it is not on the page.'
    ],
    critics: [
      { claim: 'Valuation is the whole problem. Public equities are easy; a private company, a ranch, or a portfolio of art is not, and the tax is only as good as the appraisal.',
        note: 'This is Summers and Sarin’s central point and it is why their figure is so much lower.' },
      { claim: 'The rich will move.',
        note: 'Some did, in Norway, and revenue rose anyway. Both facts are on the card. Whether that generalises to a country with citizenship-based taxation and an exit tax is not something any of these estimates answer.' },
      { claim: 'It may not survive a constitutional challenge.',
        note: 'The direct-tax apportionment question is live and unresolved in US law. The tool scores revenue, not litigation risk.' }
    ],
    sources: [
      { text: 'Saez & Zucman letter to Senator Warren (Jan 2019)', url: 'https://www.warren.senate.gov/wp-content/uploads/media/doc/saez-zucman-wealthtax.pdf' },
      { text: 'Penn Wharton Budget Model — budgetary effects of the Warren wealth tax', url: 'https://budgetmodel.wharton.upenn.edu/issues/2021/3/15/budgetary-effects-of-senator-warren-wealth-tax' },
      { text: 'Summers & Sarin — be very skeptical about how much revenue a wealth tax could generate', url: 'https://www.washingtonpost.com/opinions/2019/06/28/be-very-skeptical-about-how-much-revenue-elizabeth-warrens-wealth-tax-could-generate/' }
    ],
    engineNote: 'The scorer selector is a real dial, not a display option: choosing a scorer changes the revenue the engine reports. The card names all three and the tool never averages them.'
  });

  /* ── 4 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'flat_tax', n: 4, kind: 'engine', group: 'Replace the system',
    title: 'Switch to a flat tax',
    whatChanges: 'One rate on all taxable income, replacing the seven-bracket schedule. The card is set at 17%.',
    levers: preset({ system: 'flat', flatRate: 17 }),
    evidence: ev('flat_tax'), evidenceFrom: evPath('flat_tax'),
    figures: figs('flat_tax'),
    why: [
      'A flat tax does two things at once, and they are easy to confuse. It simplifies — one rate, fewer schedules. And it redistributes, because the money currently raised by the higher brackets has to come from somewhere or not be raised at all.',
      'At 17% the second effect dominates. The lowest quintile pays a higher average federal tax rate than it does now while the top 1% pays a lower one, and the revenue does not balance.',
      'The Tax Policy Center’s score of the Cruz plan is the closest published analogue, and it is worth reading carefully: that plan paired a 10% individual flat tax with a 16% subtraction-method business tax, which is a value-added tax in substance. The score is for the package.',
      'The distribution table on that plan is a single-year snapshot, and its groups overlap — the top quintile row contains the top 1% and top 0.1% rows. It is not the same slicing as the class chart above.'
    ],
    notes: [
      'The Cruz score is doubly stale: it predates both TCJA and OBBBA. It is on the card as the shape of the answer, not as a current price.',
      'Several of the smallest income classes in the IRS return data report tax generated that exceeds their taxable income, an artefact of how a few specific forms are tabulated. The engine treats any implied rate outside a plausible band as a reporting artefact and applies no behavioural response to it, rather than letting it produce an infinite elasticity.'
    ],
    critics: [
      { claim: 'Simplicity has real value that a distribution table does not capture — compliance costs, planning distortions, and the sheer time the current code consumes.',
        note: 'True, and none of the published scores price it. The tool scores revenue and distribution, and does not claim those are the only things that matter.' },
      { claim: 'A flat rate paired with a large exemption is not regressive; the comparison should be against a real proposal, not a bare rate.',
        note: 'Fair. The Cruz plan’s own exemption and credit structure is part of the score shown here; the sandbox’s flat-rate lever is the bare version and will read more sharply than a designed proposal would.' },
      { claim: 'Whether it loses revenue depends entirely on the rate, and 17% is a choice the card made.',
        note: 'Correct — move the slider. The rate that would hold revenue level is much higher than 17%, and the card is set there deliberately because most flat-tax proposals are.' }
    ],
    sources: [
      { text: 'Tax Policy Center — an analysis of Ted Cruz’s tax plan (Feb 2016)', url: 'https://www.urban.org/sites/default/files/publication/77811/2000612-an-analysis-of-ted-cruzs-tax-plan.pdf' }
    ],
    engineNote: 'The engine applies the flat rate across the full IRS return distribution rather than using the published package score, so its revenue figure and the Tax Policy Center’s are answers to different questions. Both are on the card.'
  });

  /* ── 5 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'fairtax', n: 5, kind: 'engine', group: 'Replace the system',
    title: 'Replace income tax with a national sales tax',
    whatChanges: 'Repeal the income and payroll taxes and levy a national retail sales tax instead, with a monthly rebate — the FairTax, H.R. 25.',
    levers: preset({ system: 'fairtax', fairtaxAssumption: 'low' }),
    variants: [{
      label: 'Assume the pessimistic deficit case', levers: preset({ system: 'fairtax', fairtaxAssumption: 'high' }),
      blurb: 'The same 23% legislated rate, scored against the less forgiving assumption about what it actually collects.'
    }],
    evidence: ev('fairtax'), evidenceFrom: evPath('fairtax'),
    figures: figs('fairtax'),
    why: [
      'Start with the rate, because the rate is where the argument begins. The bill’s 23% is quoted tax-inclusive: 23 cents of every dollar you hand over, tax included. Priced the way a sales tax is normally quoted — added to the ticket — the same rate is about 30%.',
      'Neither framing is dishonest and both describe the same tax. But they are not interchangeable, and a comparison that quotes one against a sales tax quoted the other way is comparing nothing.',
      'The second question is whether 23% raises what the taxes it replaces raise. Independent estimates put the revenue-neutral rate materially higher, which is a statement about the base: services, imputed rent, and government consumption are all much harder to tax in practice than on paper.',
      'The distributional effect follows from what consumption looks like across the income scale. Lower-income households spend nearly all of what they earn; the highest-income households do not. A tax on spending therefore reaches a larger share of a poorer household’s income, which is what the rebate is designed to offset — and how far it offsets is the live question.'
    ],
    notes: [
      'The rebate is not a detail. Without it the tax is sharply regressive; with it the bottom of the distribution is protected up to the poverty line and the shape of the answer changes above it.',
      'Repealing the payroll tax is a large part of this proposal and cuts the other way, because payroll tax is the largest federal tax most households pay.'
    ],
    critics: [
      { claim: 'The 30% framing is a rhetorical attack; nobody quotes an income tax rate tax-exclusively.',
        note: 'Also true, and it is why the tool shows both numbers rather than picking one. The framing dispute is real in both directions.' },
      { claim: 'A 23% rate cannot fund current spending, so the real proposal is either a much higher rate or a much smaller government.',
        note: 'This is the substance of the revenue-neutral-rate estimates on the card. Supporters generally accept the second half of that sentence.' },
      { claim: 'Enforcement gets harder, not easier — a retail sales tax at these rates invites evasion at the register.',
        note: 'No estimate in this dataset prices that, so the card names the objection and attaches no number to it.' }
    ],
    sources: [
      { text: 'The rate-framing dispute and revenue-neutral rate estimates, as recorded in the project data', url: 'https://taxpolicycenter.org/briefing-book/what-would-and-would-not-be-taxed-under-national-retail-sales-tax' }
    ],
    engineNote: 'The FairTax lever emits a range rather than a point, because the deficit impact at the legislated 23% is itself disputed. Both ends are labelled with the assumption that produces them.'
  });

  /* ── 6 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'fund_the_irs', n: 6, kind: 'engine', group: 'Where the money is',
    title: 'Fund the IRS',
    whatChanges: 'Restore the enforcement funding that has been cut. Nobody’s legal tax liability changes; more of what is already owed gets collected.',
    levers: preset({ enforcement: 100 }),
    evidence: ev('fund_the_irs'), evidenceFrom: evPath('fund_the_irs'),
    figures: figs('fund_the_irs'),
    why: [
      'This is the only lever in the tool that raises revenue without changing anyone’s legal liability. That is what makes it unusual, and it is exactly why it needs the hardest caveat on the page.',
      'The return on auditing the top of the distribution is high in the published research, and most of it is not the money recovered in the audit itself — it is the change in what the audited taxpayer reports in later years.',
      'The gap between what is owed and what is paid is large enough that even modest collection improvements are worth hundreds of billions over a decade.',
      'Cuts run the same arithmetic backwards. CBO scores a rescission as losing more revenue than it saves in spending — which is why the deficit figure and the revenue figure on that estimate are different numbers and both are shown.'
    ],
    notes: [
      'The ratio falls as funding scales: the published return is measured at the margin of a small enforcement budget. It does not hold as the budget grows, and treating it as a constant is the single most common misuse of this number.',
      'The published figure covers direct revenue plus specific deterrence — the audited taxpayer’s own later behaviour. It excludes general deterrence across everyone else, which some argue is larger and which nobody has credibly measured.',
      'The class chart will show nothing for this lever. Enforcement has no published distributional split in this dataset, so it is excluded and named rather than assigned an assumed distribution.'
    ],
    critics: [
      { claim: 'The return-on-investment figures are marginal estimates being used as averages, and the real number falls fast once the easy cases are exhausted.',
        note: 'The tool states this as a caveat, not as an aside, because it is the strongest objection to the strongest-looking lever on the page.' },
      { claim: 'More audits mean more burden on ordinary filers, whatever the stated targeting.',
        note: 'The research finds returns above the 90th percentile far exceed returns below the median, which is an argument about where to audit rather than whether to.' },
      { claim: 'A tool that shows one near-free lunch has undermined itself on everything else.',
        note: 'Which is why this card carries the caveat rather than the headline.' }
    ],
    sources: [
      { text: 'Boning, Hendren, Sprung-Keyser & Stuart — the returns to IRS audits (NBER w31376)', url: 'https://www.nber.org/papers/w31376' },
      { text: 'CBO — how changes in funding for the IRS affect revenues', url: 'https://www.cbo.gov/publication/59972' },
      { text: 'The Budget Lab at Yale — a weakened IRS has substantial consequences', url: 'https://budgetlab.yale.edu/research/weakened-irs-has-substantial-consequences' }
    ],
    engineNote: 'Enforcement enters the revenue total as its own labelled line, separate from the static and behavioural legs, so it can never be mistaken for a rate change financing itself.'
  });

  /* ── 7 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'scrap_the_payroll_cap', n: 7, kind: 'engine', group: 'Where the money is',
    title: 'Scrap the Social Security payroll cap',
    whatChanges: 'Apply the 12.4% Social Security tax to all earnings instead of stopping at the annual maximum. The card is set to the version that pays no extra benefits on the new earnings.',
    levers: preset({ payrollCap: 'eliminate', payrollBenefitCredit: false }),
    variants: [{
      label: 'Credit the new earnings toward benefits', levers: preset({ payrollCap: 'eliminate', payrollBenefitCredit: true }),
      blurb: 'The same headline policy with one design decision reversed. Watch how much of the shortfall it closes.'
    }],
    evidence: ev('scrap_the_payroll_cap'), evidenceFrom: evPath('scrap_the_payroll_cap'),
    figures: figs('scrap_the_payroll_cap'),
    why: [
      'The Social Security tax stops at an annual maximum. Earn twice that and the second half is untaxed for Social Security purposes, which makes the payroll tax — considered apart from the benefits it funds — the most regressive large tax in the federal system, and also the largest one most households pay.',
      'Removing the cap is the most straightforward large revenue increase available.',
      'The interesting part is the second decision, which almost nobody discusses. Social Security benefits are calculated from taxed earnings. If the newly taxed earnings also earn benefits, the programme takes in more and pays out more, and the share of the long-run shortfall it closes falls by roughly a third.',
      'So the familiar claim that scrapping the cap closes "half to two-thirds" of the gap is not uncertainty in the actuaries’ estimate. It is two different policies with the same name.'
    ],
    notes: [
      'The two CBO figures on this card are for a $250,000 threshold and for raising the taxable share of earnings to 90 percent — not for full elimination. CBO publishes no dollar figure for full elimination in that option; the actuaries publish it as a percentage of payroll instead.',
      'The SSA figures are on a 2025 Trustees Report basis. The actuaries note they are still updating the provisions to a 2026 basis.',
      'The class chart will not carry this lever. It has no published distributional split in this dataset.'
    ],
    critics: [
      { claim: 'Breaking the link between contributions and benefits turns Social Security from an earned benefit into a transfer programme, and that is a change in what the programme is.',
        note: 'This is precisely the benefit-credit decision the card makes visible. Preserving the link is the variant, and it costs about a third of the revenue.' },
      { claim: 'A 12.4% marginal addition at high incomes is a large combined rate once federal and state income tax are counted.',
        note: 'True, and it is one reason the tool shows the all-in combined rate alongside the federal bracket wherever a top rate is involved.' },
      { claim: 'It solves a cash-flow problem without addressing the demographics underneath it.',
        note: 'The actuaries’ own figures agree it does not close the whole gap in either variant.' }
    ],
    sources: [
      { text: 'CBO Budget Option — increase the maximum taxable earnings subject to Social Security payroll taxes', url: 'https://www.cbo.gov/budget-options/60955' },
      { text: 'SSA Office of the Chief Actuary — provisions affecting long-range solvency', url: 'https://www.ssa.gov/oact/solvency/provisions_tr2025/summary.pdf' },
      { text: 'SSA — contribution and benefit base by year', url: 'https://www.ssa.gov/oact/cola/cbb.html' }
    ],
    engineNote: 'The engine names the actuarial provision it is using every time this lever moves — E2.1 without a benefit credit, E2.2 with one — because the same headline policy has two published answers.'
  });

  /* ── 8 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'restore_2021_ctc', n: 8, kind: 'spend', group: 'What you could do with it',
    title: 'Bring back the 2021 Child Tax Credit',
    whatChanges: 'Restore the expanded credit: $3,600 per child under 6, $3,000 for ages 6 to 17, fully refundable, paid monthly.',
    levers: preset({ directToTransfers: true }),
    overlayKeys: ['directToTransfers'],
    evidence: ev('restore_2021_ctc'), evidenceFrom: evPath('restore_2021_ctc'),
    figures: figs('restore_2021_ctc'),
    annualCostBn: v('restore_2021_ctc', 'restore_2021_ctc.cost.value') / 10,
    annualCostBasis: 'JCT scored the one-year expansion at $109.5 billion. The card prices a year of it as a tenth of that ten-year figure, which is the same arithmetic the rest of the tool uses to move between windows.',
    povertyEvidence: {
      published: true,
      scorer: 'U.S. Census Bureau, Supplemental Poverty Measure',
      headline: 'Child poverty fell from 9.7% to 5.2% in the year the expansion was in force, then rose to 12.4% the year after it lapsed.',
      series: [
        { year: 2020, value: v('restore_2021_ctc', 'restore_2021_ctc.child_poverty_series.points.0.value') },
        { year: 2021, value: v('restore_2021_ctc', 'restore_2021_ctc.child_poverty_series.points.1.value') },
        { year: 2022, value: v('restore_2021_ctc', 'restore_2021_ctc.child_poverty_series.points.2.value') },
        { year: 2023, value: v('restore_2021_ctc', 'restore_2021_ctc.child_poverty_series.points.3.value') },
        { year: 2024, value: v('restore_2021_ctc', 'restore_2021_ctc.child_poverty_series.points.4.value') }
      ],
      caveat: 'This is an observed before-and-after, not a randomised trial, and 2021 also carried stimulus payments, expanded unemployment insurance and an expanded earned income credit. Census attributes the low mostly to the credit. The Supplemental Poverty Measure is revised between vintages and Census warns that comparisons over time should be made with caution.'
    },
    why: [
      'The 2021 credit changed three things at once: it was bigger, it reached families with no tax liability, and it arrived monthly rather than as a lump at filing.',
      'The third change is the one that gets least attention and may matter most. A credit paid in July is money for July’s rent. The same credit paid the following April is not.',
      'Full refundability is the difference between the headline amount and what a family actually receives. Today the credit is $2,200 and the refundable portion is $1,700 — a family with too little tax liability to absorb the rest cannot reach the top figure.',
      'What happened next is the closest thing to a natural experiment in modern US anti-poverty policy: the expansion ran for one year, and child poverty moved sharply in both directions around it.'
    ],
    notes: [
      'The 2024 child poverty figure on this card is secondary-sourced. Census’s own page for that year could not be reached, so the number comes from a named research organisation quoting it, and is labelled secondary.',
      'This card sets no tax levers. Raise revenue with any other card and this one tells you how many years of the programme that revenue would cover.'
    ],
    critics: [
      { claim: 'A child allowance with no work requirement reduces employment, and the poverty gain is smaller once that is counted.',
        note: 'Corinth, Meyer, Stadnicki and Wu estimate a permanent version would reduce employment by about 1.5 million workers, enough in their analysis to eliminate the effect on deep child poverty. Their figure is on this card.' },
      { claim: 'That prediction did not show up in the data.',
        note: 'Ananat, Glasner, Hamilton and Parolin looked for it in real-world monthly data over the period the payments ran and found impacts on employment and labour force participation that were very small, inconsistently signed, and statistically insignificant.' },
      { claim: 'Both can be right.',
        note: 'They are not measuring the same policy. One models a permanent child allowance; the other measures a payment everyone knew would stop in six months. Labour-supply responses to permanent and temporary changes are not the same thing, and neither team claims otherwise.' }
    ],
    sources: [
      { text: 'Census — child poverty and the Supplemental Poverty Measure', url: 'https://www.census.gov/library/stories/2024/10/child-supplemental-poverty-measure.html' },
      { text: 'Ananat, Glasner, Hamilton & Parolin — employment effects of the expanded CTC (NBER w29823)', url: 'https://www.nber.org/system/files/working_papers/w29823/w29823.pdf' },
      { text: 'AEI — Corinth & Meyer on the child tax credit, labour supply and poverty', url: 'https://www.aei.org/articles/the-child-tax-credit-labor-supply-and-poverty/' },
      { text: 'IRS Revenue Procedure 2025-32 — the credit as it stands now', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf' }
    ],
    engineNote: 'The sandbox has no child-credit control, and building one would need a household microsimulation this dataset does not contain. The card prices the programme and reports the published poverty figures; it does not model them.'
  });

  /* ── 9 ─────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'housing_vouchers', n: 9, kind: 'spend', group: 'What you could do with it',
    title: 'Housing vouchers for everyone who qualifies',
    whatChanges: 'Fund and use Housing Choice Vouchers for every income-eligible household, instead of the roughly one in four served today.',
    levers: preset({ directToTransfers: true }),
    overlayKeys: ['directToTransfers'],
    evidence: ev('housing_vouchers'), evidenceFrom: evPath('housing_vouchers'),
    figures: figs('housing_vouchers'),
    annualCostBn: v('housing_vouchers', 'housing_vouchers.cost.value'),
    annualCostBasis: 'Urban’s figure is already annual — the additional subsidy cost of serving everyone eligible, modelled on 2022 conditions. No conversion is applied.',
    povertyEvidence: {
      published: true,
      scorer: 'Urban Institute, ATTIS microsimulation (August 2023)',
      headline: 'Urban estimates the poverty rate would fall from 14.7% to 12.8%, moving 6.4 million people above the poverty line.',
      series: null,
      caveat: 'A microsimulation of 2022 conditions, not an observed outcome. It is Urban’s number, produced by Urban’s model — this tool applies no poverty elasticity of its own to it or to anything else.'
    },
    why: [
      'Housing assistance is not an entitlement. Qualifying for a voucher does not get you one; it gets you a place on a waiting list, and about three in four eligible households are not served.',
      'That makes this the rare safety-net programme where the policy question is not what to change but how many people to include.',
      'The evidence that a subsidy keeps a family housed is unusually strong, because it was tested by randomisation rather than inferred. Families in shelter were randomly assigned priority access to a long-term subsidy or to the usual mix of services, and the difference in emergency-shelter use three years later was large.',
      'The poverty effect and the homelessness effect are two different findings from two different studies, and they answer two different questions. Neither is evidence for the other.'
    ],
    notes: [
      'A widely repeated claim puts this at 9.3 million people lifted out of poverty. Urban’s published estimate is 6.4 million, and no source for the larger figure could be found; 6.4 million is the number on the card.',
      'The trial randomised priority access among families already in shelter. It is strong evidence about what a subsidy does for a family who gets one. It is not evidence about the population-wide effect of universal vouchers, and the card does not use it that way.',
      'The cost figure is annual and gross. It carries no offset for reduced spending on shelters, emergency rooms or anything else, and no published estimate of those offsets is in this dataset.',
      'This card sets no tax levers. Raise revenue with any other card and this one tells you how many years of the programme that revenue would cover.'
    ],
    critics: [
      { claim: 'Making vouchers more generous across a whole metro area mostly raises rents rather than improving housing.',
        note: 'Collinson and Ganong find exactly that for an across-the-board increase in rent ceilings — and find that indexing ceilings to neighbourhood rents instead moves voucher holders into better neighbourhoods. It is a finding about design, and both halves are on the card.' },
      { claim: 'Voucher receipt reduces work.',
        note: 'Jacob and Ludwig, using a Chicago voucher lottery, estimate a fall in labour force participation of around 4 percentage points and in quarterly earnings of about 10 percent among working-age adults.' },
      { claim: 'Supply is the binding constraint, so subsidising demand raises prices without housing more people.',
        note: 'A serious argument that no estimate in this dataset prices. The card names it and attaches no number to it.' }
    ],
    sources: [
      { text: 'Urban Institute — how much could full funding and use of housing choice vouchers reduce poverty?', url: 'https://www.urban.org/sites/default/files/2023-08/How%20Much%20Could%20Full%20Funding%20and%20Use%20of%20Housing%20Choice%20Vouchers%20Reduce%20Poverty.pdf' },
      { text: 'Gubits et al. — impact estimates from the Family Options Study (JPAM 2018)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6168747' },
      { text: 'Collinson & Ganong — how changes in housing voucher design affect rent and neighbourhood quality', url: 'https://robcollinson.github.io/RobWebsite/voucher_CollinsonGanong.pdf' },
      { text: 'Jacob & Ludwig — the effects of housing assistance on labour supply', url: 'https://www.aeaweb.org/articles?id=10.1257%2Faer.102.1.272' }
    ],
    engineNote: 'The sandbox does not score the spending side. It prices the programme from Urban’s published annual figure and divides whatever revenue your settings raise by it.'
  });

  /* ── 10 ────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'carbon_tax_and_dividend', n: 10, kind: 'published', group: 'Replace the system',
    title: 'A carbon tax with a per-person dividend',
    whatChanges: 'Tax carbon at the wellhead and the smokestack, then hand the money back as an equal per-person rebate.',
    levers: preset({}),
    evidence: ev('carbon_tax_and_dividend'), evidenceFrom: evPath('carbon_tax_and_dividend'),
    figures: figs('carbon_tax_and_dividend'),
    why: [
      'A carbon tax on its own is regressive. Energy is a larger share of a poorer household’s budget, so a tax on it takes a larger share of a poorer household’s income.',
      'Pair it with an equal per-person rebate and the sign flips at the bottom of the distribution, because an equal dollar rebate is a large share of a small income and a small share of a large one.',
      'That is the lesson this card exists for: the instrument is regressive and the policy is progressive, and the difference between them is a design choice, not a property of carbon pricing.',
      'Treasury’s own modelling contains a complication worth keeping. The tax alone bears less proportionally on the top 5% than on several middle deciles, because the very rich save a larger share of what they earn. It cuts against the simple story and it ships anyway.'
    ],
    notes: [
      'The rate escalates. Describing this policy by its opening rate alone understates it by the end of the modelled schedule.',
      'The sandbox has no carbon lever. Every figure on this card is Treasury’s published estimate, not this tool’s. Tapping the card will not move the controls.',
      'A commonly cited gross-revenue figure of $1.9 trillion could not be traced to a primary source. Treasury’s published figure is $2.96 trillion, and that is the number on the card.'
    ],
    critics: [
      { claim: 'A tax high enough to change behaviour is high enough to hurt, and the rebate arrives after the bill does.',
        note: 'Timing is a real design problem that the incidence tables do not capture.' },
      { claim: 'It is regionally uneven in a way national averages hide — a rural household with a long commute and no transit is not the average household in any decile.',
        note: 'No estimate in this dataset breaks the incidence down by geography.' },
      { claim: 'Political durability is the binding constraint, not the economics.',
        note: 'The card’s own evidence rating says as much: strong on incidence, weak on political durability.' }
    ],
    sources: [
      { text: 'US Treasury Office of Tax Analysis Working Paper 115 — methodology for analysing a carbon tax', url: 'https://home.treasury.gov/system/files/131/WP-115.pdf' }
    ],
    engineNote: 'This is a published-figures card. The engine scores nothing here, and the revenue, class and GDP panels will not move when you open it.'
  });

  /* ── 11 ────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'obbba_baseline', n: 11, kind: 'baseline', group: 'You are here',
    title: 'Do nothing — what current law already does',
    whatChanges: 'Nothing. This is the law as it stands after the One Big Beautiful Bill Act, which is the baseline every other card is measured against.',
    levers: preset({}),
    evidence: ev('obbba_baseline'), evidenceFrom: evPath('obbba_baseline'),
    figures: figs('obbba_baseline'),
    why: [
      'Every score in this tool is a change from somewhere, and this is the somewhere. Open this card and the sandbox reads zero across the board — not because nothing is happening, but because this is the point the measurements start from.',
      'What current law is already doing is not zero. CBO scores the act as adding $3.4 trillion to deficits over ten years, with the lowest decile of households losing resources and the highest decile gaining them.',
      'The distributional figures are period averages, not a single year, and CBO explicitly declines to give annual figures because the provisions phase in and out at different times.',
      'The measure is household RESOURCES — income plus in-kind transfers, net of taxes — and the bottom-decile loss is driven substantially by changes to Medicaid and SNAP rather than by tax provisions. Presenting it as a purely tax-side result would be wrong.'
    ],
    notes: [
      'This is why the baseline labels on every other card matter. Almost every published revenue score in this tool was produced before OBBBA, when the TCJA individual provisions were still assumed to expire at the end of 2025. They did not. Those scores are directionally stale, and most revenue-raisers would score higher against a permanent-TCJA baseline. Only three sources in the whole dataset are post-OBBBA.',
      'The distributional score is of H.R. 1 as it stood in June 2025, not of the enacted text. The deficit score is of the enacted law.',
      'Restoring pre-TCJA rates is not in this library: OBBBA made those provisions permanent, so there is no expiration left to score. This card is the current-law view that replaced it.'
    ],
    critics: [
      { claim: 'A ten-year deficit score says nothing about whether the underlying policy is worth having.',
        note: 'Correct. It is an arithmetic statement about the budget, not a verdict.' },
      { claim: 'Distributional tables that count in-kind transfers as income overstate what the bottom decile loses when a benefit is trimmed.',
        note: 'A genuine methodological dispute about how to value in-kind benefits. CBO states its measure plainly and the card repeats it.' },
      { claim: 'Scoring against a baseline in which tax cuts expire always makes permanence look expensive.',
        note: 'True, and it is exactly why every score in this tool carries its baseline label.' }
    ],
    sources: [
      { text: 'CBO — estimated budgetary effects of Public Law 119-21', url: 'https://www.cbo.gov/publication/61570' },
      { text: 'CBO — distributional effects of H.R. 1', url: 'https://www.cbo.gov/system/files/2025-06/61387-Distributional-Effects.pdf' }
    ],
    engineNote: 'Opening this card resets every control to current law, so every readout shows zero.'
  });

  /* ── 12 ────────────────────────────────────────────────────────────── */
  cards.push({
    id: 'tra86_model', n: 12, kind: 'engine', group: 'Replace the system',
    title: 'The 1986 model: broaden the base, lower the rates',
    whatChanges: 'Cut the top individual rate to 28% and the corporate rate to 34%, tax capital gains at the same rate as ordinary income, and pay for it by closing preferences.',
    levers: preset({
      topRate: 28, capGainsRate: 31.8, corporateRate: 34,
      loopholes: { s199a: true, salt: true, carriedInterest: true, muniPA: true, cryptoWash: true }
    }),
    evidence: ev('tra86_model'), evidenceFrom: evPath('tra86_model'),
    figures: figs('tra86_model'),
    why: [
      'The Tax Reform Act of 1986 is the bipartisan template everyone reaches for, and it is worth understanding what it actually did. It cut the top individual rate from 50% to 28% and the corporate rate from 46% to 34%, and it paid for both by eliminating deductions, credits and preferences — including taxing capital gains at the same rate as wages.',
      'It was designed to be revenue-neutral, and it was: individuals got a large tax cut and corporations got a matching tax increase.',
      'Then look at what lasted. The 28% rate lasted three years. By 1993 the top rate was 39.6%. The preferences came back, in the same form or in new ones, and the base narrowed again.',
      'There is a mechanism in this tool that says why the pairing is not arbitrary. Broadening the base lowers the elasticity of taxable income, because there are fewer places for income to go. A lower elasticity RAISES the rate at which revenue peaks. Base-broadening and higher rates are complements — which is the same argument the critics of the 1986 template make, and it is built into the engine rather than asserted in the copy.'
    ],
    notes: [
      'This card applies 1986’s SHAPE to today’s code. It is not a re-enactment of the 1986 bill: 199A and carried interest did not exist then, and the deduction the act repealed was the sales-tax deduction rather than state and local taxes generally. The mortgage interest deduction survived 1986 and is left alone here.',
      'Setting capital gains to 28% statutory is 31.8% all-in once the 3.8% investment income tax is counted. In 1986 there was no such surtax, so the two are not the same number.',
      'Watch the revenue decomposition rather than the headline. The rate cuts contribute a large negative and the base-broadeners a large positive, and the guardrail holds: the rate cut does not finance itself here or anywhere else in the tool.'
    ],
    critics: [
      { claim: 'Revenue neutrality and distributional neutrality were the right goals in 1986 and are the wrong goals now, given the deficit.',
        note: 'This is the Economic Policy Institute’s central objection to the template, and it is a judgement about circumstances rather than about the 1986 arithmetic.' },
      { claim: 'Base-broadening is a substitute for rate increases.',
        note: 'The research says the opposite — broadening the base is complemented by higher marginal rates, because it lowers the behavioural response. The engine implements exactly that coupling.' },
      { claim: 'The 1986 deal is proof the two parties can agree on tax reform.',
        note: 'It is also proof of how quickly such a deal comes apart: the rate cut outlasted the base-broadening by decades.' }
    ],
    sources: [
      { text: 'CRFB — the 1986 Tax Reform Act turns 27', url: 'https://www.crfb.org/blogs/1986-tax-reform-act-turns-27' },
      { text: 'EPI — broadening the base and raising top rates are complements, not substitutes', url: 'https://www.epi.org/publication/ib361-broadening-the-tax-base-and-raising-top-rates/' }
    ],
    engineNote: 'This card is the strongest test of the engine’s own coupling: turning broadeners on lowers the effective elasticity, and the why-panel will say so and show the move.'
  });

  return cards;
}

return {
  buildCards: buildCards,
  encodeState: encodeState,
  decodeState: decodeState,
  normalizeLevers: normalizeLevers,
  normalizeAssumptions: normalizeAssumptions,
  STATE_VERSION: STATE_VERSION
};
}));
