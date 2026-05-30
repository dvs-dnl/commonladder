/*
 * my-ladder-questionnaire.js
 *
 * Shared questionnaire for Common Ladder's "My Ladder" tool. Used by both the
 * standalone /static-tools/my-ladder.html and the embedded version in the
 * homepage hero (index.html).
 *
 * Exposes two globals:
 *   - window.QUESTIONS       — the question schema (id, text, options)
 *   - window.mountQuestionnaire(containerEl, options) — render + wire handlers
 *
 * On completion, mountQuestionnaire saves the plan to localStorage at
 *   commonladder.plan.v1
 * and invokes options.onComplete(plan). The host page decides what to do next
 * (render the ladder inline, redirect to my-ladder.html, etc.).
 *
 * No build step — vanilla JS, no dependencies, no framework.
 *
 * NOTE on storage: the site explicitly does not require accounts. Everything
 * lives in the user's browser. Clearing site data clears the plan.
 */
(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Question schema — shared across all mount points so both pages stay in sync.
  // Adding/removing/reordering questions here updates both index.html and
  // my-ladder.html on next page load.
  // --------------------------------------------------------------------------
  var QUESTIONS = [
    {
      id: 'housing',
      text: "What's your housing situation right now?",
      options: [
        { emoji: '🚨', label: 'I need shelter tonight', value: 'crisis' },
        { emoji: '🏠', label: "I'm in emergency shelter or a mission", value: 'shelter' },
        { emoji: '🛋️', label: "I'm couch-surfing, in a motel, or in transitional housing", value: 'transitional' },
        { emoji: '⚠️', label: "I have housing but I'm at risk of losing it", value: 'atrisk' },
        { emoji: '✅', label: 'I have stable housing', value: 'housed' }
      ]
    },
    {
      id: 'family',
      text: 'Who is with you?',
      options: [
        { emoji: '🧍', label: "Just me", value: 'solo' },
        { emoji: '👫', label: "Me and a partner", value: 'couple' },
        { emoji: '👨‍👩‍👧', label: "Me and my child(ren)", value: 'kids' },
        { emoji: '🤰', label: "I'm pregnant", value: 'pregnant' },
        { emoji: '👴', label: "I'm caring for an elder or disabled adult", value: 'caregiver' }
      ]
    },
    {
      id: 'income',
      text: 'How are you covering basic expenses right now?',
      options: [
        { emoji: '💼', label: "I have a job", value: 'job' },
        { emoji: '📋', label: "I'm receiving benefits (SNAP, SSI, SSDI, TANF, etc.)", value: 'benefits' },
        { emoji: '🙏', label: "Help from family or friends", value: 'family' },
        { emoji: '🚫', label: "I have no income right now", value: 'none' }
      ]
    },
    {
      id: 'docs',
      text: 'Do you have your ID documents?',
      options: [
        { emoji: '✅', label: 'Yes — ID, Social Security card, birth certificate', value: 'full' },
        { emoji: '🪪', label: 'I have ID but not all my documents', value: 'partial' },
        { emoji: '❌', label: "I've lost everything or never had documents", value: 'none' }
      ]
    },
    {
      id: 'insurance',
      text: 'Do you have health insurance?',
      options: [
        { emoji: '🏥', label: 'Yes — Medicaid/AHCCCS', value: 'medicaid' },
        { emoji: '💳', label: 'Yes — private or employer insurance', value: 'private' },
        { emoji: '🎖️', label: 'Yes — VA or Medicare', value: 'va' },
        { emoji: '❌', label: "I don't have insurance", value: 'none' }
      ]
    },
    {
      id: 'transport',
      text: 'How do you get around?',
      options: [
        { emoji: '🚗', label: 'I have a working vehicle', value: 'car' },
        { emoji: '🚌', label: 'I use public transit', value: 'transit' },
        { emoji: '🚶', label: "I walk or bike most places", value: 'walk' },
        { emoji: '🤝', label: "I rely on rides from others", value: 'rides' }
      ]
    },
    {
      id: 'employment',
      text: 'What about work?',
      options: [
        { emoji: '✅', label: "I'm employed and want to keep my job", value: 'employed' },
        { emoji: '🔎', label: "I'm looking for work", value: 'seeking' },
        { emoji: '🛠️', label: "I want job training or certification", value: 'training' },
        { emoji: '🩺', label: "I can't work right now (health/family)", value: 'unable' },
        { emoji: '🎓', label: "I'm a student", value: 'student' }
      ]
    }
  ];

  // --------------------------------------------------------------------------
  // localStorage helpers — versioned key so schema changes can migrate cleanly.
  // --------------------------------------------------------------------------
  var STORAGE_KEY = 'commonladder.plan.v1';
  var SCHEMA_VERSION = 1;

  function loadSavedPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var plan = JSON.parse(raw);
      // Only return plans that match our current schema version.
      if (!plan || plan.version !== SCHEMA_VERSION) return null;
      return plan;
    } catch (e) {
      return null;
    }
  }

  function savePlan(plan) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
      return true;
    } catch (e) {
      // Quota exceeded, private mode, etc. — we surface this in the UI
      // but don't block the user from continuing.
      return false;
    }
  }

  function clearPlan() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // computeCurrentRung — same logic as the original inline code in
  // my-ladder.html. Maps answers to a "where to start" rung index.
  // --------------------------------------------------------------------------
  function computeCurrentRung(a) {
    if (a.housing === 'crisis') return 0;
    if (a.housing === 'shelter') return 1;
    if (a.housing === 'transitional' || a.housing === 'atrisk') return 2;
    if (a.housing === 'housed') {
      if (a.docs !== 'full') return 1;
      if (a.income === 'none' || a.income === 'benefits') return 3;
      return 4;
    }
    return 0;
  }

  // --------------------------------------------------------------------------
  // mountQuestionnaire — render the question card into containerEl and wire
  // up navigation. On completion, save the plan + call options.onComplete.
  //
  // Options:
  //   onComplete(plan) — called after save (host renders results, redirects, etc.)
  //   initialAnswers   — pre-fill answers (e.g. for Retake from existing plan)
  //   compact          — boolean: render a tighter version for embedded contexts
  // --------------------------------------------------------------------------
  function mountQuestionnaire(containerEl, options) {
    options = options || {};
    var answers = Object.assign({}, options.initialAnswers || {});
    var currentStep = 0;

    // Build the questionnaire DOM inside the container.
    containerEl.innerHTML =
      '<div class="ml-q-progress">' +
        '<div class="ml-q-progress-label">' +
          '<span class="ml-q-progress-text">Question 1 of ' + QUESTIONS.length + '</span>' +
          '<span class="ml-q-progress-pct">' + Math.round(100/QUESTIONS.length) + '%</span>' +
        '</div>' +
        '<div class="ml-q-progress-track">' +
          '<div class="ml-q-progress-fill" style="width:' + Math.round(100/QUESTIONS.length) + '%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ml-q-card">' +
        '<div class="ml-q-num">Question 1</div>' +
        '<div class="ml-q-text">Loading…</div>' +
        '<div class="ml-q-options"></div>' +
        '<div class="ml-q-nav">' +
          '<button type="button" class="ml-q-back" style="display:none">← Back</button>' +
          '<button type="button" class="ml-q-next" disabled>Continue →</button>' +
        '</div>' +
      '</div>';

    var $progressText = containerEl.querySelector('.ml-q-progress-text');
    var $progressPct = containerEl.querySelector('.ml-q-progress-pct');
    var $progressFill = containerEl.querySelector('.ml-q-progress-fill');
    var $qNum = containerEl.querySelector('.ml-q-num');
    var $qText = containerEl.querySelector('.ml-q-text');
    var $qOpts = containerEl.querySelector('.ml-q-options');
    var $btnBack = containerEl.querySelector('.ml-q-back');
    var $btnNext = containerEl.querySelector('.ml-q-next');

    function renderQuestion(idx) {
      currentStep = idx;
      var q = QUESTIONS[idx];
      var pct = Math.round(((idx + 1) / QUESTIONS.length) * 100);
      $progressText.textContent = 'Question ' + (idx + 1) + ' of ' + QUESTIONS.length;
      $progressPct.textContent = pct + '%';
      $progressFill.style.width = pct + '%';
      $qNum.textContent = 'Question ' + (idx + 1);
      $qText.textContent = q.text;

      $qOpts.innerHTML = '';
      q.options.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ml-q-btn' + (answers[q.id] === opt.value ? ' selected' : '');
        btn.setAttribute('aria-pressed', answers[q.id] === opt.value ? 'true' : 'false');
        btn.innerHTML = '<span class="ml-q-emoji">' + opt.emoji + '</span><span>' + opt.label + '</span>';
        btn.addEventListener('click', function () { selectAnswer(q.id, opt.value, btn); });
        $qOpts.appendChild(btn);
      });

      $btnBack.style.display = idx === 0 ? 'none' : '';
      $btnNext.disabled = !answers[q.id];
      $btnNext.textContent = idx === QUESTIONS.length - 1 ? 'See my plan →' : 'Continue →';
    }

    function selectAnswer(qId, value, clickedBtn) {
      answers[qId] = value;
      Array.prototype.forEach.call($qOpts.querySelectorAll('.ml-q-btn'), function (b) {
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
      });
      clickedBtn.classList.add('selected');
      clickedBtn.setAttribute('aria-pressed', 'true');
      $btnNext.disabled = false;
    }

    function goNext() {
      var q = QUESTIONS[currentStep];
      if (!answers[q.id]) return;
      if (currentStep === QUESTIONS.length - 1) {
        completeQuestionnaire();
      } else {
        renderQuestion(currentStep + 1);
      }
    }

    function goBack() {
      if (currentStep > 0) renderQuestion(currentStep - 1);
    }

    function completeQuestionnaire() {
      // Preserve any existing rungs state when retaking (so notes/checks
      // aren't wiped just because the user adjusted an answer).
      var existing = loadSavedPlan();
      var prevRungs = (existing && existing.rungs) || {};

      var plan = {
        version: SCHEMA_VERSION,
        answers: answers,
        currentRung: computeCurrentRung(answers),
        completedAt: new Date().toISOString(),
        rungs: prevRungs
      };
      var ok = savePlan(plan);
      if (typeof options.onComplete === 'function') {
        options.onComplete(plan, { saved: ok });
      }
    }

    $btnNext.addEventListener('click', goNext);
    $btnBack.addEventListener('click', goBack);

    renderQuestion(0);

    // Return a small handle in case the host wants to reset programmatically.
    return {
      reset: function () { answers = {}; renderQuestion(0); }
    };
  }

  // --------------------------------------------------------------------------
  // Expose the public surface.
  // --------------------------------------------------------------------------
  window.MyLadder = {
    QUESTIONS: QUESTIONS,
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    mountQuestionnaire: mountQuestionnaire,
    loadSavedPlan: loadSavedPlan,
    savePlan: savePlan,
    clearPlan: clearPlan,
    computeCurrentRung: computeCurrentRung
  };
})();
