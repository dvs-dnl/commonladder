const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('static-tools/ged-pathway-finder.html', 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, detail){
  if(cond){ pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function boot(opts){
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://commonladder.org/static-tools/ged-pathway-finder.html', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function(){};
  return dom;
}

function tap(doc, attr, val){
  const b = doc.querySelector('[' + attr + '="' + val + '"]');
  if(!b) throw new Error('no chip ' + attr + '=' + val);
  b.click();
  return b;
}
function submit(doc){ doc.getElementById('gpf-form').dispatchEvent(new (doc.defaultView.Event)('submit', {bubbles:true, cancelable:true})); }
function txt(doc, id){ const e = doc.getElementById(id); return e ? e.textContent.replace(/\s+/g,' ').trim() : ''; }

console.log('\n=== PATH 1: default / nothing tapped (most common entry) ===');
{
  const dom = boot(); const doc = dom.window.document;
  submit(doc);
  ok('results revealed', !doc.getElementById('gpf-results').hidden);
  ok('routes to GED testing pathway', /GED.*Testing Pathway/.test(txt(doc,'gpf-route-title')), txt(doc,'gpf-route-title'));
  ok('five numbered steps rendered', doc.querySelectorAll('#gpf-steps li').length === 5, String(doc.querySelectorAll('#gpf-steps li').length));
  ok('call list non-empty', doc.querySelectorAll('#gpf-call-list li').length > 0);
  ok('ADE state office always present', /602-258-2410/.test(txt(doc,'gpf-call-list')));
  ok('211 fallback always present', /2-1-1/.test(txt(doc,'gpf-call-list')));
  ok('16/17 flag hidden when not selected', doc.getElementById('gpf-flag').hidden);
  ok('situation notes hidden when none tapped', doc.getElementById('gpf-also').hidden);
  ok('no-answer disclosure shown', /default starting point/.test(txt(doc,'gpf-route-why')), txt(doc,'gpf-route-why'));
  ok('script is a complete sentence', /finish my high school equivalency diploma/.test(txt(doc,'gpf-script-body')));
  dom.window.close();
}

console.log('\n=== PATH 2: college credits only -> College Credit Pathway ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-have','college');
  submit(doc);
  ok('routes to College Credit Pathway', /College Credit Pathway/.test(txt(doc,'gpf-route-title')), txt(doc,'gpf-route-title'));
  ok('states the 25-credit rule', /25\b/.test(txt(doc,'gpf-route-body')));
  ok('credit breakdown present (6/6/4/3/3/3)', /English Arts 6.*Mathematics 6.*Natural Science 4/.test(txt(doc,'gpf-route-body')));
  ok('civics-before-filing warning present', /before/i.test(txt(doc,'gpf-steps')) && /Civics/.test(txt(doc,'gpf-steps')));
  ok('ADE transcript address present', /1535 W\. Jefferson/.test(txt(doc,'gpf-steps')));
  ok('no-mixing limit stated', /cannot mix GED scores/.test(txt(doc,'gpf-steps')));
  ok('script mentions college credits', /College Credit Pathway/.test(txt(doc,'gpf-script-body')));
  dom.window.close();
}

console.log('\n=== PATH 3: mixed progress -> HSE PLUS ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-have','hscredits');
  tap(doc,'data-have','certs');
  tap(doc,'data-have','somesubjects');
  submit(doc);
  ok('routes to HSE PLUS', /HSE PLUS/.test(txt(doc,'gpf-route-title')), txt(doc,'gpf-route-title'));
  ok('states 22 points', /22\b/.test(txt(doc,'gpf-route-body')));
  ok('states WIOA Title II enrollment requirement', /WIOA Title II/.test(txt(doc,'gpf-route-body')));
  ok('EVIT surfaced for HSE PLUS (CTE co-located)', /EVIT/.test(txt(doc,'gpf-call-list')));
  dom.window.close();
}

console.log('\n=== PATH 4: EDGE CASE - passed all four subjects + college credits (conflicting signals) ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-have','allsubjects');
  tap(doc,'data-have','college');
  tap(doc,'data-have','hscredits');
  submit(doc);
  ok('never reroutes away from GED when all 4 passed', /GED.*Testing Pathway/.test(txt(doc,'gpf-route-title')), txt(doc,'gpf-route-title'));
  ok('civics gate still shown (the whole point)', /70 out of 100/.test(doc.querySelector('.gpf-civics').textContent));
  dom.window.close();
}

console.log('\n=== PATH 5: EDGE CASE - 16/17 year old, no ID, no card, unhoused ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-sit','under18');
  tap(doc,'data-sit','noid');
  tap(doc,'data-sit','nocard');
  tap(doc,'data-sit','unstable');
  submit(doc);
  ok('minor flag shown first', !doc.getElementById('gpf-flag').hidden);
  ok('names notarized consent requirement', /notarized/.test(txt(doc,'gpf-flag-body')));
  ok('names school withdrawal verification', /formally withdrew/.test(txt(doc,'gpf-flag-body')));
  ok('names online-exam guardian rule', /pre-test check-in/.test(txt(doc,'gpf-flag-body')));
  ok('gives ADE as the deciding office', /602-258-2410/.test(txt(doc,'gpf-flag-body')));
  ok('ID Project surfaced for no-ID', /Homeless ID Project/.test(txt(doc,'gpf-call-list')));
  ok('prepaid-card workaround shown', /Bluebird/.test(txt(doc,'gpf-cost-card')));
  ok('unhoused note present', /does not require an address|requires an address/i.test(txt(doc,'gpf-also-list')));
  ok('three situation notes rendered (under18 intentionally not duplicated)', doc.querySelectorAll('#gpf-also-list article').length === 3, String(doc.querySelectorAll('#gpf-also-list article').length));
  ok('under18 lives in the flag block, not the notes list', !/16 or 17/.test(txt(doc,'gpf-also-list')));
  ok('script surfaces the paperwork question', /paperwork/.test(txt(doc,'gpf-script-body')));
  dom.window.close();
}

console.log('\n=== PATH 6: area filter narrows the call list ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-area','west');
  submit(doc);
  const t = txt(doc,'gpf-call-list');
  ok('West Valley programs listed', /Avondale/.test(t) && /Surprise/.test(t) && /Glendale/.test(t));
  ok('East Valley programs excluded', !/Queen Creek/.test(t), 'leaked east-valley entry');
  ok('state office still appended', /602-258-2410/.test(t));
  dom.window.close();
}

console.log('\n=== PATH 7: localStorage round-trip + corrupt-storage resilience ===');
{
  // round trip
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-have','college');
  tap(doc,'data-sit','working');
  tap(doc,'data-area','east');
  submit(doc);
  const saved = dom.window.localStorage.getItem('cl-gpf-v1');
  ok('state written to localStorage', !!saved && /college/.test(saved));
  ok('no PII in stored payload', !/name|email|phone|dob|address/i.test(saved), saved);
  dom.window.close();

  // restore
  const dom2 = new JSDOM(html, { runScripts:'outside-only', url:'https://commonladder.org/' });
  // simulate: inject saved value then boot fresh
  const dom3 = new JSDOM(html, { runScripts:'dangerously', url:'https://commonladder.org/static-tools/ged-pathway-finder.html', pretendToBeVisual:true,
    beforeParse(w){ w.HTMLElement.prototype.scrollIntoView = function(){}; try{ w.localStorage.setItem('cl-gpf-v1', saved); }catch(e){} } });
  const d3 = dom3.window.document;
  ok('restores chips on reload', d3.querySelector('[data-have="college"]').getAttribute('aria-pressed') === 'true');
  ok('auto-renders results on reload', !d3.getElementById('gpf-results').hidden);
  ok('restored route is correct', /College Credit Pathway/.test(txt(d3,'gpf-route-title')));
  dom3.window.close();

  // corrupt storage
  const dom4 = new JSDOM(html, { runScripts:'dangerously', url:'https://commonladder.org/static-tools/ged-pathway-finder.html', pretendToBeVisual:true,
    beforeParse(w){ w.HTMLElement.prototype.scrollIntoView=function(){}; try{ w.localStorage.setItem('cl-gpf-v1','{{{not json'); }catch(e){} } });
  const d4 = dom4.window.document;
  ok('corrupt storage degrades silently to blank form', d4.getElementById('gpf-results').hidden);
  submit(d4);
  ok('still functional after corrupt storage', !d4.getElementById('gpf-results').hidden && /GED/.test(txt(d4,'gpf-route-title')));
  dom4.window.close();

  // storage entirely unavailable
  const dom5 = new JSDOM(html, { runScripts:'dangerously', url:'https://commonladder.org/static-tools/ged-pathway-finder.html', pretendToBeVisual:true,
    beforeParse(w){ w.HTMLElement.prototype.scrollIntoView=function(){};
      Object.defineProperty(w,'localStorage',{ get(){ throw new Error('SecurityError: storage disabled'); } }); } });
  const d5 = dom5.window.document;
  tap(d5,'data-have','college');
  submit(d5);
  ok('works with localStorage throwing (private mode)', !d5.getElementById('gpf-results').hidden && /College Credit/.test(txt(d5,'gpf-route-title')));
  dom5.window.close();
}

console.log('\n=== PATH 8: clear button resets everything ===');
{
  const dom = boot(); const doc = dom.window.document;
  tap(doc,'data-have','college'); tap(doc,'data-sit','noid'); tap(doc,'data-area','east');
  submit(doc);
  doc.getElementById('gpf-clear').click();
  ok('results hidden after clear', doc.getElementById('gpf-results').hidden);
  ok('chips unpressed after clear', doc.querySelector('[data-have="college"]').getAttribute('aria-pressed') === 'false');
  ok('storage cleared', !dom.window.localStorage.getItem('cl-gpf-v1'));
  dom.window.close();
}

console.log('\n=== A11Y / canon spot checks ===');
{
  const dom = boot(); const doc = dom.window.document;
  ok('single h1', doc.querySelectorAll('h1').length === 1, String(doc.querySelectorAll('h1').length));
  ok('skip link present', !!doc.querySelector('a.skip-link'));
  ok('breadcrumb present', !!doc.querySelector('.breadcrumb'));
  ok('all chips are type=button (no accidental submit)', Array.from(doc.querySelectorAll('.gpf-chip')).every(b=>b.getAttribute('type')==='button'));
  ok('all chips have aria-pressed', Array.from(doc.querySelectorAll('.gpf-chip')).every(b=>b.hasAttribute('aria-pressed')));
  ok('each fieldset has a legend', Array.from(doc.querySelectorAll('#gpf-form fieldset')).every(f=>!!f.querySelector('legend')));
  ok('results region is aria-live', doc.getElementById('gpf-results').getAttribute('aria-live')==='polite');
  ok('canonical GA id present', /G-3YXK0RL6XV/.test(html));
  ok('retired GA id absent', !/G-XLKR4ZSZ5J/.test(html));
  ok('3-line favicon block', /favicon\.svg/.test(html) && /favicon-32\.png/.test(html) && /apple-touch-icon\.png/.test(html));
  ok('honeycomb nav mark (247 viewBox)', /viewBox="0 0 247 247"/.test(html));
  ok('retired staircase polygon absent', !/points="0,60 18,72/.test(html));
  ok('nav CTA -> /find.html "Find resources"', /href="\/find\.html" class="nav__cta">Find resources/.test(html));
  ok('My Ladder CTA class', /nav__cta nav__cta--ladder/.test(html));
  ok('cl-card-click snippet', /data-id="cl-card-click"/.test(html));
  ok('crisis bar present', /class="crisis-bar"/.test(html));
  ok('footer transparency block', /footer__transparency/.test(html));
  ok('no inputs collecting PII', doc.querySelectorAll('input[type=text],input[type=email],input[type=tel],textarea').length === 0);
  ok('verify note present', /Verify before you go/.test(html));
  ok('corrections link present', /corrections@commonladder\.org/.test(html));
  dom.window.close();
}

console.log('\n---------------------------------------');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
