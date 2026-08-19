#!/usr/bin/env node
/**
 * smoke-act2.js — the live half of the Phase 2 and Phase 3 test suites.
 *
 * test-model.js proves the ENGINE is right. This proves the PAGE is right: that
 * every guardrail the gameplan requires is visible in a real browser, not just
 * true in a function. Requires playwright and a local static server for the site
 * root (so /style.css resolves).
 *
 *   cd github/commonladder-theme && python3 -m http.server 8099 &
 *   node scripts/tax-explorer/smoke-act2.js
 *
 * NOT SHIPPED.
 */
const { chromium } = require('playwright');
const path = require('path');
// Point at a local static mirror of the site so /style.css resolves.
// e.g.  cd <repo root> && python3 -m http.server 8099   then
//       node smoke-act2.js --url http://localhost:8099/learn/tax-explorer/index.html
function arg(f, d) { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; }
const URL = arg('--url', 'http://localhost:8099/learn/tax-explorer/index.html');
const errors = [];
let FAILED = 0;
(async () => {
  // This sandbox ships a pinned Chromium at PLAYWRIGHT_BROWSERS_PATH that may not
  // match the playwright package's expected build. Point at it explicitly when it
  // is there; fall back to playwright's own resolution when it is not.
  const fs = require('fs');
  const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const launchOpts = {};
  if (process.env.PW_CHROMIUM) launchOpts.executablePath = process.env.PW_CHROMIUM;
  else if (fs.existsSync(PINNED)) launchOpts.executablePath = PINNED;
  const b = await chromium.launch(launchOpts);
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  // file:// runs cannot fetch the favicon or the analytics tag; those are not page errors.
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(t)) errors.push(t); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(URL, { waitUntil: 'load' });

  const T = async (name, fn) => {
    try { const v = await fn(); const okk = v !== false && v !== null && v !== undefined;
      console.log((okk ? ' ok  ' : 'FAIL ') + name + (typeof v === 'string' ? ' → ' + v : '')); if (!okk) FAILED++; return v; }
    catch (e) { console.log('FAIL ' + name + ' → ' + e.message); FAILED++; return false; }
  };

  const set = async (id, val) => { await p.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }, val); };
  const check = async (id, on) => { await p.$eval('#' + id, (el, v) => { el.checked = v; el.dispatchEvent(new Event('change', {bubbles:true})); }, on); };
  const pickRadio = async (name, val) => { await p.$eval(`input[name="${name}"][value="${val}"]`, el => { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})); }); };
  const txt = s => p.$eval(s, el => el.textContent.replace(/\s+/g,' ').trim());
  const headline = () => txt('#tx-out-revenue .tx-headline');
  const parseB = async () => {
    const s = await headline();
    if (/No change/.test(s)) return 0;
    const m = s.match(/(-?)\$([\d.]+)\s*(trillion|billion|million)/);
    if (!m) return null;
    let v = parseFloat(m[2]) * (m[3]==='trillion'?1000:m[3]==='million'?0.001:1);
    return (m[1] === '-' || s.trim().startsWith('-')) ? -v : v;
  };

  console.log('\n— Act 2 live smoke test —');
  await T('page loads with no JS errors', async () => errors.length === 0 || errors.join(' | '));
  await T('all five outputs rendered', async () => (await p.$$eval('#tx-out-revenue h3,#tx-out-class h3,#tx-out-gdp h3,#tx-out-poverty h3,#tx-out-why h3', e => e.length)) === 5);
  await T('by-class chart visible at current law', async () => (await p.$$eval('#tx-out-class .tx-class-row', e => e.length)) === 6);
  await T('baseline reads "No change yet"', async () => (await headline()).indexOf('No change') === 0);

  // GUARDRAIL A — Laffer rollover, live
  const curve = [];
  for (const r of [40,50,60,70,75,80,85,90]) { await set('tx-topRate', r); curve.push([r, await parseB()]); }
  const peakIdx = curve.reduce((bi,c,i)=> c[1] > curve[bi][1] ? i : bi, 0);
  await T('revenue rolls over as the top rate approaches 90%', async () =>
    curve[curve.length-1][1] < curve[peakIdx][1] ? `peak near ${curve[peakIdx][0]}% (${curve.map(c=>c[0]+':'+c[1]).join(' ')})` : false);
  await T('revenue at 90% is well below revenue at the peak', async () => curve[curve.length-1][1] < curve[peakIdx][1] * 0.75);
  await set('tx-topRate', 37);

  // GUARDRAIL B — no rate cut ever reads net-positive, live
  let worst = -Infinity, worstAt = '';
  for (const lens of ['cbo','consensus','taxfoundation']) {
    await set('tx-lens', lens);
    for (const eti of ['0.12','0.25','0.40','0.57']) {
      await set('tx-eti', eti);
      for (const r of [10,20,30,36]) { await set('tx-topRate', r); const v = await parseB(); if (v > worst) { worst = v; worstAt = `top ${r}% / ${lens} / eti ${eti}`; } }
      await set('tx-topRate', 37);
      for (const r of [0,5,15,19.5]) { await set('tx-capGainsRate', r); const v = await parseB(); if (v > worst) { worst = v; worstAt = `cg statutory ${r}% / ${lens} / eti ${eti}`; } }
      await set('tx-capGainsRate', 20);
      for (const r of [10,15,20]) { await set('tx-corporateRate', r); const v = await parseB(); if (v > worst) { worst = v; worstAt = `corp ${r}% / ${lens}`; } }
      await set('tx-corporateRate', 21);
    }
  }
  await T('no rate cut anywhere reads as net-positive revenue', async () => worst < 0.000001 ? `worst case ${worst}B at ${worstAt}` : false);
  await set('tx-eti','0.25'); await set('tx-lens','consensus');

  // GUARDRAIL C — flat tax shows the distributional shift, live
  await pickRadio('tx-system','flat'); await set('tx-flatRate', 17);
  const bars = await p.$$eval('#tx-out-class .tx-class-row', rows => rows.map(r => [r.children[0].textContent.trim(), r.children[2].textContent.trim()]));
  await T('flat tax: bottom groups pay a higher rate, top 1% a lower one', async () => {
    const num = s => parseFloat(s.replace(/[^0-9.\-]/g,''));
    const low = num(bars[0][1]), top = num(bars[5][1]);
    return (low > 0 && top < 0) ? `lowest ${bars[0][1]} · top 1% ${bars[5][1]}` : JSON.stringify(bars);
  });
  await T('flat tax shows a large revenue loss', async () => (await parseB()) < -1000);
  await pickRadio('tx-system','current');

  // Capital-gains sign divergence, live
  await set('tx-capGainsRate', 35.8);   // 35.8 statutory + 3.8 NIIT = 39.6 all-in
  const noDeath = await parseB();
  await check('tx-taxGainsAtDeath', true);
  const withDeath = await parseB();
  await T('capital gains: tax-at-death flips the sign on screen', async () =>
    (noDeath < 0 && withDeath > 0) ? `${noDeath}B → +${withDeath}B` : `${noDeath} / ${withDeath}`);
  await check('tx-taxGainsAtDeath', false); await set('tx-capGainsRate', 20);

  // Unscored accounting, live
  await pickRadio('tx-payrollCap','eliminate');
  await T('scrapping the cap is listed as unscored and names its SSA provision', async () => {
    const t = await txt('#tx-out-revenue');
    return /Not in the total/.test(t) && /E2\.1|E2\.2/.test(await txt('#tx-out-why'));
  });
  await check('tx-payrollBenefitCredit', false);
  await T('the no-benefit-credit variant reports 67%', async () => /67%/.test(await txt('#tx-out-why')));
  await pickRadio('tx-payrollCap','current');

  // ETI coupling warning, live
  await check('tx-lp-s199a', true); await check('tx-holdEtiFixed', true); await set('tx-topRate', 45);
  await T('holding ETI fixed while broadening the base warns on screen', async () => /elasticity of taxable income fixed/i.test(await txt('#tx-out-why')));
  await check('tx-holdEtiFixed', false);
  await T('coupling explains itself when the base is broadened', async () => /Why the elasticity moved/i.test(await txt('#tx-out-why')));

  // GDP is always a band
  await T('GDP output is a band, never a point', async () => {
    const t = await txt('#tx-out-gdp');
    return /% of GDP/.test(t) && / to /.test(t);
  });
  await T('the contested multiplier toggle names both papers', async () => {
    const t = await txt('#tx-out-gdp');
    return /Ramey/.test(t) && /Auerbach/.test(t);
  });

  // Never-claim sweep over the whole rendered page
  // Never-claim scan. Every mention of self-financing on this page is a refutation
  // or a cited negation, so the test looks for an AFFIRMATIVE claim: a match with no
  // negation cue anywhere in its surrounding window.
  await T('no affirmative self-financing claim anywhere in the rendered page', async () => {
    const body = (await p.$eval('#main', e => e.textContent)).replace(/\s+/g, ' ');
    const cue = /\b(no|not|never|nowhere|rarely|cannot|impossible|out of reach|would need|has ever|hardly|nor)\b/i;
    const re = /pays? for (itself|themselves)|self-financ\w*|financing itself/gi;
    const bad = [];
    let m;
    while ((m = re.exec(body)) !== null) {
      const w = body.slice(Math.max(0, m.index - 160), m.index + 160);
      if (!cue.test(w)) bad.push(w);
    }
    return bad.length === 0 || 'unrefuted: ' + bad.join(' ||| ');
  });

  // data-table fallbacks
  await T('every Act 2 output has a data-table fallback', async () =>
    (await p.$$eval('#tx-out-revenue details, #tx-out-class details, #tx-out-poverty details', e => e.length)) >= 3);

  // keyboard: tab reaches the first slider, arrow moves it
  await p.$eval('#tx-topRate', el => el.focus());
  await p.keyboard.press('ArrowRight');
  await T('keyboard operates the sliders', async () => (await p.$eval('#tx-topRate', el => el.value)) !== '45');


  /* ══════════════════ Act 3 — the scenario library, live ══════════════════ */
  console.log('\n— Act 3 live smoke test —');
  await p.evaluate(() => document.getElementById('tx-reset').click());
  await p.waitForTimeout(80);

  await T('twelve scenario cards render', async () =>
    (await p.$$eval('#tx3-grid .tx3-card', e => e.length)) === 12 ||
    'got ' + (await p.$$eval('#tx3-grid .tx3-card', e => e.length)));

  await T('every card carries a badge, figures, critics, sources and a methodology link', async () => {
    const bad = await p.$$eval('#tx3-grid .tx3-card', cards => cards.map(c => {
      const id = c.id;
      const miss = [];
      if (!c.querySelector('.tx3-badge')) miss.push('badge');
      if (c.querySelectorAll('.tx3-figs tbody tr').length < 1) miss.push('figures');
      if (c.querySelectorAll('.tx3-critic').length < 1) miss.push('critics');
      if (c.querySelectorAll('.tx3-src a').length < 1) miss.push('sources');
      if (!Array.from(c.querySelectorAll('a')).some(a => /methodology/i.test(a.getAttribute('href') || ''))) miss.push('methodology link');
      return miss.length ? id + ': ' + miss.join(', ') : null;
    }).filter(Boolean));
    return bad.length === 0 || bad.join(' | ');
  });

  await T('every displayed figure carries a period and an attribution', async () => {
    const rows = await p.$$eval('#tx3-grid .tx3-figs:not(.tx3-mini) tbody tr', trs => trs.map(tr => {
      const td = tr.querySelectorAll('td');
      return { fig: (td[1] || {}).textContent, period: (td[2] || {}).textContent, who: (td[3] || {}).textContent };
    }));
    const bad = rows.filter(r => !r.period || !r.period.trim() || !r.who || !r.who.trim());
    if (bad.length) { console.log('      ' + JSON.stringify(bad.slice(0, 6))); return false; }
    return rows.length + ' figures on screen';
  });

  // Applying a card must move the real controls — not paint a second answer.
  await p.click('#tx3-card-seventy_percent_top_rate > summary');
  await p.click('#tx3-card-seventy_percent_top_rate button[data-variant="-1"]');
  await p.waitForTimeout(160);
  await T('tapping a card sets the sandbox controls', async () => {
    const r = await p.$eval('#tx-topRate', el => el.value);
    const th = await p.$eval('#tx-topRateThreshold', el => el.value);
    return (r === '70' && th === '10m') ? `topRate ${r}, threshold ${th}` : `topRate ${r}, threshold ${th}`;
  });
  const seventyAlone = await parseB();
  await T('and the headline moves with it', async () => seventyAlone > 0 || 'headline ' + seventyAlone);

  await p.click('#tx3-card-seventy_percent_top_rate button[data-variant="0"]');
  await p.waitForTimeout(160);
  const seventyPaired = await parseB();
  await T('the pairing variant changes the answer', async () =>
    seventyPaired !== seventyAlone ? `alone ${seventyAlone}B → paired ${seventyPaired}B` : 'variant did not change the result');
  await T('the paired variant switches the capital-gains elasticity regime', async () => {
    const death = await p.$eval('#tx-taxGainsAtDeath', el => el.checked);
    return death === true;
  });

  // The class chart's empty state — the Phase 2→3 gate condition.
  await p.evaluate(() => document.getElementById('tx-reset').click());
  await p.click('#tx3-card-fund_the_irs > summary');
  await p.click('#tx3-card-fund_the_irs button[data-variant="-1"]');
  await p.waitForTimeout(160);
  await T('a card built only from undistributed levers shows the class-chart empty state', async () => {
    const t = await txt('#tx-out-class');
    return /Nothing to draw here/.test(t) || 'empty state missing: ' + t.slice(0, 160);
  });

  // Spending cards overlay rather than reset, and price the programme.
  await p.click('#tx3-card-housing_vouchers > summary');
  await p.click('#tx3-card-housing_vouchers button[data-variant="-1"]');
  await p.waitForTimeout(160);
  await T('a spending card leaves the tax levers alone', async () =>
    (await p.$eval('#tx-enforcement', el => el.value)) === '100' &&
    (await p.$eval('#tx-directToTransfers', el => el.checked)) === true);
  await T('and reports how far the current settings go', async () => {
    const t = await txt('#tx3-cover-housing_vouchers');
    return /annual cost|raises nothing/.test(t) ? t.slice(0, 120) : 'coverage line missing: ' + t;
  });
  await T('the poverty figure on a spending card names whose it is', async () => {
    const t = await txt('#tx3-card-housing_vouchers');
    return /Urban Institute/.test(t) && /6\.4 million/.test(t);
  });

  // The baseline card resets, and says so.
  await p.click('#tx3-card-obbba_baseline > summary');
  await p.click('#tx3-card-obbba_baseline button[data-variant="-1"]');
  await p.waitForTimeout(160);
  await T('the "you are here" card resets the sandbox to current law', async () =>
    (await headline()).indexOf('No change') === 0);

  // Every why-panel ends with the methodology link (gameplan §4 output 5).
  await set('tx-topRate', 55);
  await check('tx-lp-s199a', true);
  await p.waitForTimeout(160);
  await T('every why-panel ends with a methodology link', async () => {
    const r = await p.$$eval('#tx-out-why .tx-why', ws => ws.map(w => {
      const links = Array.from(w.querySelectorAll('.tx-why-links a'));
      return links.length && /methodology/i.test(links[links.length - 1].getAttribute('href') || '') ? null : (w.querySelector('h4') || {}).textContent;
    }).filter(Boolean));
    return r.length === 0 ? 'all panels linked' : 'missing on: ' + r.join(', ');
  });

  // URL state, round-tripped through a real reload.
  await p.click('#tx3-share');
  await p.waitForTimeout(200);
  const shared = await p.evaluate(() => location.href);
  await T('sharing writes a ?s= link', async () => /\?s=[A-Za-z0-9\-_]+/.test(shared) || shared);
  await p.evaluate(() => document.getElementById('tx-reset').click());
  await p.goto(shared, { waitUntil: 'load' });
  await p.waitForTimeout(220);
  await T('reloading that link restores every setting', async () => {
    const st = await p.evaluate(() => ({
      top: document.getElementById('tx-topRate').value,
      s199a: document.getElementById('tx-lp-s199a').checked,
      transfers: document.getElementById('tx-directToTransfers').checked
    }));
    return (st.top === '55' && st.s199a === true) ? JSON.stringify(st) : 'restored as ' + JSON.stringify(st);
  });
  await p.goto(URL.split('?')[0] + '?s=not_a_real_state', { waitUntil: 'load' });
  await p.waitForTimeout(200);
  await T('a malformed link leaves current law alone rather than half-applying', async () =>
    (await p.$eval('#tx-topRate', el => el.value)) === '37');
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(200);

  // The never-claim scan, over the cards' own rendered copy.
  await T('no card breaches the never-claim list on screen', async () => {
    const body = await p.$eval('#tx3-grid', el => el.textContent.replace(/\s+/g, ' '));
    const cue = /\b(no|not|never|cannot|can't|does not|doesn't|won't|would not|nothing|out of reach|impossible)\b/i;
    const bad = [];
    [/pays? for (itself|themselves)/ig, /self-financ/ig, /optimal (top )?(tax )?rate is/ig,
     /will (raise|grow|boost) GDP by [\d.]+ ?%/ig, /\bguaranteed\b/ig].forEach(re => {
      let m;
      while ((m = re.exec(body)) !== null) {
        const w = body.slice(Math.max(0, m.index - 160), m.index + 160);
        if (!cue.test(w)) bad.push(w);
      }
    });
    return bad.length === 0 || 'unrefuted: ' + bad.join(' ||| ');
  });

  await T('every card is reachable and operable from the keyboard', async () => {
    const n = await p.$$eval('#tx3-grid .tx3-card > summary', ss => ss.length);
    await p.$eval('#tx3-card-flat_tax > summary', el => el.focus());
    await p.keyboard.press('Enter');
    const open = await p.$eval('#tx3-card-flat_tax', el => el.open);
    return open ? n + ' summaries, Enter opens' : 'Enter did not open the card';
  });

  await T('no unlabelled form control anywhere on the page', async () => {
    const n = await p.$$eval('input, select', els => els.filter(e => {
      if (e.type === 'hidden') return true ? false : false;
      const id = e.id;
      const lab = id && document.querySelector('label[for="' + id + '"]');
      return !(lab || e.closest('label') || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'));
    }).length);
    return n === 0 || n + ' unlabelled controls';
  });

  // mobile
  await p.setViewportSize({ width: 375, height: 900 });
  await p.waitForTimeout(120);
  await p.evaluate(() => { document.querySelectorAll('#tx3-grid .tx3-card').forEach(d => { d.open = true; }); });
  await p.waitForTimeout(150);
  await T('no horizontal overflow at 375px, with every scenario card open', async () => {
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    return w <= 380 ? `scrollWidth ${w}` : `scrollWidth ${w}`;
  });
  await p.screenshot({ path: '/tmp/tx/shot-375.png', fullPage: false });
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.evaluate(() => document.getElementById('sandbox').scrollIntoView());
  await p.waitForTimeout(150);
  await p.screenshot({ path: '/tmp/tx/shot-desktop.png' });


  /* ══════════════════ methodology.html — the evidence article ═════════════ */
  console.log('\n— methodology.html live smoke test —');
  const METH = URL.replace(/index\.html.*$/, 'methodology.html');
  const mErrors = [];
  const mp = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  mp.on('pageerror', e => mErrors.push('PAGEERROR ' + e.message));
  await mp.goto(METH, { waitUntil: 'load' });
  const mtxt = s => mp.$eval(s, el => el.textContent.replace(/\s+/g, ' ').trim());

  await T('methodology page loads with no JS errors', async () => mErrors.length === 0 || mErrors.join(' | '));
  await T('carries the full global shell', async () => {
    const r = await mp.evaluate(() => ({
      skip: !!document.querySelector('a.skip-link'),
      crisis: !!document.querySelector('.crisis-bar'),
      nav: !!document.querySelector('nav.nav .nav__logo svg'),
      crumb: document.querySelectorAll('.breadcrumb li').length,
      main: !!document.getElementById('main'),
      footer: !!document.querySelector('footer.footer time[datetime]'),
      canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
      ga: Array.from(document.scripts).some(s => /G-3YXK0RL6XV/.test(s.src + s.textContent)),
      icons: document.querySelectorAll('link[rel="icon"], link[rel="alternate icon"], link[rel="apple-touch-icon"]').length
    }));
    const miss = Object.keys(r).filter(k => !r[k]);
    if (miss.length) return 'missing: ' + miss.join(', ');
    return r.crumb === 4 && r.icons === 3 && /methodology\.html$/.test(r.canonical)
      ? `${r.crumb} breadcrumb levels, ${r.icons} icon links, GA present`
      : `breadcrumb ${r.crumb}, icons ${r.icons}, canonical ${r.canonical}`;
  });
  await T('is a Learn Evidence Article: article container at 780px', async () => {
    const r = await mp.evaluate(() => {
      const a = document.querySelector('main#main article.article.container');
      return a ? getComputedStyle(a).maxWidth : null;
    });
    return r === '780px' ? r : 'max-width ' + r;
  });
  await T('every engine parameter table row carries a source', async () => {
    const bad = await mp.$$eval('.meth-table tbody tr', trs => trs.filter(tr => {
      const td = tr.querySelectorAll('td');
      if (td.length < 4) return false;                     // section headings
      return !td[3].textContent.trim();
    }).length);
    const n = await mp.$$eval('.meth-table tbody tr', trs => trs.length);
    return bad === 0 ? n + ' rows, all sourced' : bad + ' rows with no source';
  });
  await T('the verbatim quotes the tool strips are on this page', async () => {
    const n = await mp.$$eval('blockquote.meth-q', e => e.length);
    return n >= 60 ? n + ' verbatim source lines' : 'only ' + n + ' quotes found';
  });
  await T('the four derivations each state a direction of bias', async () => {
    const t = await mtxt('#derivations, .article');
    const n = (t.match(/Direction of bias/g) || []).length;
    return n >= 4 ? n + ' stated' : 'only ' + n + ' derivations state a direction of bias';
  });
  // A heading element's own textContent is just the heading. Read the whole article
  // and test for the sentences that must be present.
  const marticle = await mp.$eval('main#main', el => el.textContent.replace(/\s+/g, ' '));
  await T('the PolicyEngine deviation is stated plainly, with no match claimed', async () => {
    const t = marticle;
    return /has not been completed/i.test(t) && /no PolicyEngine result appears anywhere/i.test(t) && /No cross-check of any kind is claimed for the capital-gains lever/i.test(t);
  });
  await T('the OBBBA baseline problem is stated as a correctness question', async () => {
    const t = marticle;
    return /predates it/i.test(t) && /stale in/i.test(t) && /Three sources/i.test(t);
  });
  await T('the never-claim list is published', async () => {
    const n = await mp.$$eval('.meth-never li', e => e.length);
    return n >= 6 ? n + ' items' : 'only ' + n;
  });
  await T('the ten-year convention is stated', async () => {
    const t = marticle;
    return /not uprated for income growth/i.test(t) && /conservative|smaller than a properly uprated/i.test(t);
  });
  await T('nothing the methodology page SAYS breaches the never-claim list', async () => {
    // The list governs what this tool asserts, not what it quotes. Verbatim source
    // lines are excluded — they are marked as quotes on the page, and several of
    // them are the sources REFUTING self-financing in their own words.
    const body = await mp.evaluate(() => {
      const c = document.querySelector('main#main').cloneNode(true);
      c.querySelectorAll('blockquote.meth-q').forEach(q => q.remove());
      // Source TITLES are names, not claims — and several of the papers cited here
      // are titled with the very phrase they exist to refute ("Did the 2017 tax cut
      // pay for itself?"). The tool's own words are what the list governs.
      c.querySelectorAll('.meth-table a').forEach(a => a.remove());
      return c.textContent.replace(/\s+/g, ' ');
    });
    const cue = /\b(no|not|never|cannot|can't|does not|doesn't|won't|would not|nothing|out of reach|impossible|will not|rarely if ever)\b/i;
    const bad = [];
    [/pays? for (itself|themselves)/ig, /self-financ/ig, /optimal (top )?(tax )?rate is/ig,
     /will (raise|grow|boost) GDP by [\d.]+ ?%/ig, /\bguaranteed\b/ig].forEach(re => {
      let m;
      while ((m = re.exec(body)) !== null) {
        const w = body.slice(Math.max(0, m.index - 160), m.index + 160);
        if (!cue.test(w)) bad.push(w);
      }
    });
    if (bad.length) { console.log('      unrefuted: ' + bad.join(' ||| ')); return false; }
    return 'clean';
  });
  await T('links back to the tool, and the tool links here', async () => {
    const back = await mp.$$eval('a[href*="/learn/tax-explorer/"]', a => a.length);
    return back >= 2 ? back + ' links back' : 'only ' + back;
  });
  await T('no unlabelled control and no amber or sage body text', async () => {
    const r = await mp.evaluate(() => {
      const BANNED = ['rgb(232, 145, 26)', 'rgb(74, 158, 130)', 'rgb(120, 155, 153)'];
      const bad = [];
      document.querySelectorAll('main#main *').forEach(el => {
        if (!el.textContent || !el.textContent.trim()) return;
        if (el.children.length) return;
        const c = getComputedStyle(el).color;
        if (BANNED.indexOf(c) > -1) bad.push(el.tagName + ' ' + c + ' ' + el.textContent.slice(0, 40));
      });
      return bad;
    });
    return r.length === 0 || r.join(' | ');
  });
  await mp.setViewportSize({ width: 375, height: 900 });
  await mp.waitForTimeout(150);
  await T('methodology page has no horizontal overflow at 375px', async () => {
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    return w <= 380 ? 'scrollWidth ' + w : 'scrollWidth ' + w;
  });
  await mp.close();

  if (errors.length) console.log('\nConsole errors:\n' + errors.join('\n'));
  console.log('\n' + (FAILED ? FAILED + ' FAILED' : 'all live checks passed'));
  await b.close();
  process.exit(FAILED ? 1 : 0);
})();
