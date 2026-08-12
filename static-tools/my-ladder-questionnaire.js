/*
 * my-ladder-questionnaire.js
 *
 * Shared questionnaire for Common Ladder's "My Ladder" tool. Used by both the
 * standalone /static-tools/my-ladder.html and the embedded version in the
 * homepage hero (index.html).
 *
 * Exposes window.MyLadder with:
 *   - QUESTIONS            — the question schema (id, text, options, multi, skipIf)
 *   - mountQuestionnaire(containerEl, options) — render + wire handlers
 *   - has(answers, qid, value) / labelsFor(qid, answers) — answer-shape helpers
 *
 * On completion, mountQuestionnaire saves the plan to localStorage at
 *   commonladder.plan.v1
 * and invokes options.onComplete(plan). The host page decides what to do next
 * (render the ladder inline, redirect to my-ladder.html, etc.).
 *
 * No build step — vanilla JS, no dependencies, no framework.
 *
 * ANSWER SHAPES (schema v2)
 *   Single-select questions store a string:   answers.housing === 'crisis'
 *   Multi-select questions store an array:    answers.income  === ['job','benefits']
 *   Always read multi-select answers through MyLadder.has() rather than ===,
 *   so consumers don't have to care which shape a question uses.
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
  //
  //   multi: true       — checkbox behavior; the answer is stored as an array
  //   exclusive: true   — (option flag) selecting it clears every other option,
  //                       and selecting anything else clears it. For "none of
  //                       these" answers that can't coexist with the others.
  //   skipIf: fn(answers) -> bool — question is not shown when this returns true
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
      hint: 'Select all that apply.',
      multi: true,
      options: [
        { emoji: '💼', label: "I have a job", value: 'job' },
        { emoji: '📋', label: "I'm receiving benefits (SNAP, SSI, SSDI, TANF, etc.)", value: 'benefits' },
        { emoji: '🙏', label: "Help from family or friends", value: 'family' },
        { emoji: '🚫', label: "I have no income right now", value: 'none', exclusive: true }
      ]
    },
    {
      id: 'docs',
      text: 'Which ID documents do you have?',
      hint: 'Select all that apply.',
      multi: true,
      options: [
        { emoji: '🪪', label: "Personal ID (driver's license or state ID)", value: 'id' },
        { emoji: '🔢', label: 'Social Security card', value: 'ssn' },
        { emoji: '📜', label: 'Birth certificate', value: 'birth' },
        { emoji: '🎖️', label: 'DD-214 (military discharge papers)', value: 'dd214' },
        { emoji: '❌', label: "I've lost everything, or never had documents", value: 'none', exclusive: true }
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
      // Someone who already told us they have a job on the income question has
      // effectively answered this one. Skipping it removes a redundant step and
      // prevents the contradictory "I have a job" + "I'm looking for work" pair.
      skipIf: function (a) { return has(a, 'income', 'job'); },
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
  // Answer-shape helpers. Consumers should use these instead of comparing
  // answers.x === 'y' directly, so single- and multi-select questions can be
  // read the same way.
  // --------------------------------------------------------------------------
  function toArray(v) {
    if (v == null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }

  // has(answers, 'income', 'job') → true if that value was selected.
  function has(answers, qid, value) {
    return toArray(answers && answers[qid]).indexOf(value) !== -1;
  }

  // hasAll(answers, 'docs', ['id','ssn']) → true only if every value is selected.
  function hasAll(answers, qid, values) {
    var got = toArray(answers && answers[qid]);
    return values.every(function (v) { return got.indexOf(v) !== -1; });
  }

  // Human-readable labels for an answer, in schema order. Always an array.
  function labelsFor(qid, answers) {
    var q = QUESTIONS.find(function (x) { return x.id === qid; });
    var got = toArray(answers && answers[qid]);
    if (!q) return got;
    return q.options
      .filter(function (o) { return got.indexOf(o.value) !== -1; })
      .map(function (o) { return o.label; });
  }

  // Which questions apply, given the answers so far.
  function visibleQuestions(answers) {
    return QUESTIONS.filter(function (q) {
      return typeof q.skipIf !== 'function' || !q.skipIf(answers || {});
    });
  }

  function isAnswered(answers, q) {
    return toArray(answers[q.id]).length > 0;
  }

  // --------------------------------------------------------------------------
  // localStorage helpers — versioned key so schema changes can migrate cleanly.
  // --------------------------------------------------------------------------
  var STORAGE_KEY = 'commonladder.plan.v1';
  var SCHEMA_VERSION = 2;

  // v1 → v2: income and docs became multi-select. Income was a single string,
  // so it becomes a one-item array. Docs used three coarse buckets, which we
  // expand into the documents a person in that bucket would have reported.
  var DOCS_V1_TO_V2 = {
    full: ['id', 'ssn', 'birth'],
    partial: ['id'],
    none: ['none']
  };

  function migratePlan(plan) {
    if (!plan || typeof plan !== 'object') return null;
    if (plan.version === SCHEMA_VERSION) return plan;
    if (plan.version !== 1) return null; // unknown or older — start fresh

    var a = Object.assign({}, plan.answers || {});
    if (typeof a.income === 'string') a.income = [a.income];
    if (typeof a.docs === 'string') a.docs = DOCS_V1_TO_V2[a.docs] || ['none'];

    // v1 had no skip rules, so an old plan can hold an answer to a question
    // that no longer applies (e.g. employment alongside "I have a job").
    var keep = visibleQuestions(a);
    QUESTIONS.forEach(function (q) {
      if (keep.indexOf(q) === -1) delete a[q.id];
    });

    return Object.assign({}, plan, {
      version: SCHEMA_VERSION,
      answers: a,
      currentRung: computeCurrentRung(a)
    });
  }

  function loadSavedPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var stored = JSON.parse(raw);
      var plan = migratePlan(stored);
      if (!plan) return null;
      // Write the migration back so we only pay for it once.
      if (stored.version !== SCHEMA_VERSION) savePlan(plan);
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
  // computeCurrentRung — maps answers to a "where to start" rung index.
  // Reads multi-select answers through has()/hasAll(), so someone who selected
  // several income sources is placed by the strongest one.
  // --------------------------------------------------------------------------
  function hasCoreDocs(a) {
    return hasAll(a, 'docs', ['id', 'ssn', 'birth']);
  }

  function computeCurrentRung(a) {
    if (a.housing === 'crisis') return 0;
    if (a.housing === 'shelter') return 1;
    if (a.housing === 'transitional' || a.housing === 'atrisk') return 2;
    if (a.housing === 'housed') {
      if (!hasCoreDocs(a)) return 1;
      if (has(a, 'income', 'job')) return 4;
      if (has(a, 'income', 'none') || has(a, 'income', 'benefits')) return 3;
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
    var steps = visibleQuestions(answers); // recomputed whenever answers change
    var currentStep = 0;

    containerEl.innerHTML =
      '<div class="ml-q-progress">' +
        '<div class="ml-q-progress-label">' +
          '<span class="ml-q-progress-text">Question 1 of ' + steps.length + '</span>' +
          '<span class="ml-q-progress-pct">' + Math.round(100 / steps.length) + '%</span>' +
        '</div>' +
        '<div class="ml-q-progress-track">' +
          '<div class="ml-q-progress-fill" style="width:' + Math.round(100 / steps.length) + '%"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ml-q-card">' +
        '<div class="ml-q-num">Question 1</div>' +
        '<div class="ml-q-text">Loading…</div>' +
        '<div class="ml-q-hint" hidden></div>' +
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
    var $qHint = containerEl.querySelector('.ml-q-hint');
    var $qOpts = containerEl.querySelector('.ml-q-options');
    var $btnBack = containerEl.querySelector('.ml-q-back');
    var $btnNext = containerEl.querySelector('.ml-q-next');

    // Recompute the visible question list, keeping the user on the question
    // they were looking at. Called after any answer change, because an answer
    // can add or remove a later question (see skipIf).
    function resyncSteps(keepQuestion) {
      steps = visibleQuestions(answers);
      if (keepQuestion) {
        var i = steps.indexOf(keepQuestion);
        if (i !== -1) currentStep = i;
      }
      currentStep = Math.max(0, Math.min(currentStep, steps.length - 1));
      // Drop answers to questions that no longer apply, so a skipped question
      // can't leak a stale value into the saved plan.
      QUESTIONS.forEach(function (q) {
        if (steps.indexOf(q) === -1) delete answers[q.id];
      });
    }

    function renderQuestion(idx) {
      currentStep = Math.max(0, Math.min(idx, steps.length - 1));
      var q = steps[currentStep];
      var pct = Math.round(((currentStep + 1) / steps.length) * 100);

      $progressText.textContent = 'Question ' + (currentStep + 1) + ' of ' + steps.length;
      $progressPct.textContent = pct + '%';
      $progressFill.style.width = pct + '%';
      $qNum.textContent = 'Question ' + (currentStep + 1);
      $qText.textContent = q.text;

      if (q.hint) {
        $qHint.textContent = q.hint;
        $qHint.hidden = false;
      } else {
        $qHint.textContent = '';
        $qHint.hidden = true;
      }

      // Multi-select questions are a checkbox group; single-select stay as
      // toggle buttons. Both render as <button> so styling and keyboard
      // behavior stay identical — only the ARIA role differs.
      $qOpts.innerHTML = '';
      $qOpts.setAttribute('role', 'group');
      $qOpts.setAttribute('aria-label', q.text);

      q.options.forEach(function (opt) {
        var on = has(answers, q.id, opt.value);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ml-q-btn' + (on ? ' selected' : '') + (q.multi ? ' ml-q-btn--multi' : '');
        btn.setAttribute('data-value', opt.value);
        if (q.multi) {
          btn.setAttribute('role', 'checkbox');
          btn.setAttribute('aria-checked', on ? 'true' : 'false');
        } else {
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        btn.innerHTML =
          (q.multi ? '<span class="ml-q-check" aria-hidden="true"></span>' : '') +
          '<span class="ml-q-emoji">' + opt.emoji + '</span><span>' + opt.label + '</span>';
        btn.addEventListener('click', function () { selectAnswer(q, opt, opt.value); });
        $qOpts.appendChild(btn);
      });

      $btnBack.style.display = currentStep === 0 ? 'none' : '';
      $btnNext.disabled = !isAnswered(answers, q);
      $btnNext.textContent = currentStep === steps.length - 1 ? 'See my plan →' : 'Continue →';
    }

    function selectAnswer(q, opt, focusValue) {
      if (q.multi) {
        var picked = toArray(answers[q.id]).slice();
        var i = picked.indexOf(opt.value);

        if (i !== -1) {
          picked.splice(i, 1);                        // toggle off
        } else if (opt.exclusive) {
          picked = [opt.value];                       // "none" clears the rest
        } else {
          picked = picked.filter(function (v) {       // any other pick clears "none"
            var o = q.options.find(function (x) { return x.value === v; });
            return !(o && o.exclusive);
          });
          picked.push(opt.value);
        }

        // Store in schema order so saved plans read consistently.
        answers[q.id] = q.options
          .map(function (o) { return o.value; })
          .filter(function (v) { return picked.indexOf(v) !== -1; });
        if (!answers[q.id].length) delete answers[q.id];
      } else {
        answers[q.id] = opt.value;
      }

      // This answer may have added or removed a later question.
      resyncSteps(q);
      renderQuestion(currentStep);

      // Re-rendering replaced the button that was just clicked; put focus back
      // on its replacement so keyboard users don't get dropped to the top.
      if (focusValue) {
        var again = $qOpts.querySelector('.ml-q-btn[data-value="' + focusValue + '"]');
        if (again && document.activeElement !== again) again.focus();
      }
    }

    function goNext() {
      var q = steps[currentStep];
      if (!isAnswered(answers, q)) return;
      resyncSteps(q);
      if (currentStep >= steps.length - 1) {
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

    resyncSteps();
    renderQuestion(0);

    return {
      reset: function () { answers = {}; resyncSteps(); renderQuestion(0); }
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
    computeCurrentRung: computeCurrentRung,
    visibleQuestions: visibleQuestions,
    has: has,
    hasAll: hasAll,
    labelsFor: labelsFor,
    toArray: toArray
  };
})();
