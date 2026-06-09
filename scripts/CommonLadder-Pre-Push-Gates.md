# Common Ladder — Pre-Push Gates

`scripts/gate-check.py` codifies the regressions commonladder.org has actually shipped
at least once, so they can never re-ship silently. It runs automatically before every
`git push` (via `scripts/pre-push`) and is modeled on the autovetting gate-check pass.

Two tiers:

- **CRITICAL** — refuses the push (exit 1). Each one maps to a real incident.
- **WARN** — prints, never blocks. Backlog / drift signals for human review.

Run it manually any time:

```bash
python3 scripts/gate-check.py
```

It exits `0` when every CRITICAL gate passes, `1` otherwise. Runtime is ~7s.

---

## CRITICAL gates

### G1 — Inline JS syntax valid
Every inline `<script>` (excluding `application/ld+json`, `text/template`, and the GA
loader) is fed through Node's `new Function(body)`. A single apostrophe inside a
single-quoted string, or a missing array comma, throws a SyntaxError that kills the whole
IIFE — and every navigator and tool on this site is a hand-written inline JS wizard, so a
syntax slip silently breaks the page's core function. **Incident:** recurring across the
navigator family; this is the direct backstop.

### G2 — JSON-LD blocks valid JSON
Every `application/ld+json` block must `json.loads()`. Blog posts carry `Article` schema
(per the page-type spec); a trailing comma or unescaped quote breaks structured data for
the whole post and the break is invisible in the browser. **Incident:** structured-data
drift on blog posts.

### G3 — GA tag consistent + present on every page
Exactly one GA4 measurement ID site-wide (`G-3YXK0RL6XV`), and it must appear on every
non-exempt page. `garden-planner.html` is exempt (intentionally off-brand, design-canon
Rule 7). **Incident:** the `Design canon audit fixes: … GA tag` commit — analytics broke
when a page shipped without the tag, and a stray legacy ID is the classic copy-paste bug
(the autovetting `G-06S3EWDPXK` incident, carried forward here as a universal cheap check).

### G4 — Global shell present (nav + footer)
Every non-redirect, non-exempt page must contain a `<nav>` and a `<footer>`. **Incident:**
`find.html` shipped without a `<footer>` — the canon calls this "the most common omission
pattern" (Rule 3) — and `static-tools/flagstaff-navigator.html` shipped without a global
`<nav>`. Redirect stubs (`http-equiv="refresh"`) and `garden-planner.html` are exempt.
`flagstaff-navigator.html` was converted to the standard shell on 2026-06-07 (global nav +
wordmark, self-contained shell CSS), so `NAV_PRESENT_EXEMPT` is now empty — there are no
nav-presence exemptions.

### G5 — Internal links + favicon resolve (no 404s)
Every `href` to an internal path — plus the `/favicon.svg` referenced by the favicon link
tag — must resolve to a real file. Root-relative, page-relative, directory (`/x/` →
`/x/index.html`), and extension-less forms are all resolved. Dynamic JS-built hrefs
(`href="' + url + '"`, `${…}`, `[REPLACE:…]`) are skipped. **Incident:** the
`Design canon audit fixes: … broken links` commit (canon Rule 6); `/favicon.svg` was
referenced by **181 pages while the file did not exist**; and a blog post linked the
nonexistent `/help/rental-assistance/`. All three were closed in the hardening pass that
shipped this gate.

### G6 — Interactive-page IIFEs have no undefined identifiers
The largest inline script of each key interactive page (`find.html`,
`benefit-screener.html`, a representative navigator, `my-ladder.html`) is evaluated in a
stubbed DOM via Node's `vm`. The gate fails only on `ReferenceError` / "is not defined" —
i.e. an identifier used but never defined. **Incident:** carried from autovetting G14. The
silent-failure mode is universal to every site that runs JS in an IIFE: a refactor drops a
definition but leaves the use, the page still "loads," and the wizard quietly dies. The DOM
stub is deliberately generous (document, window, location, history, localStorage, console,
gtag, btoa/atob, …) so only genuine undefined-identifier errors trip it.

### G7 — Nav CTA → /find.html, text "Find resources"
The amber nav CTA must point to `/find.html` with the exact text "Find resources".
**Incident:** canon Rule 1 — the retired targets (`/coc-finder.html`, "Find help now")
regressed in before and had to be reverted (the UX-fixes commit). Cheap, specific backstop
against that specific regression returning.

---

## WARN gates (never block)

### G8 — Single `<h1>` per page
SEO + a11y. The city navigators were backfilled with a screen-reader `<h1>` (2026-06-07);
this gate keeps every page at exactly one `<h1>`.

### G9 — No amber/sage as text color (WCAG AA)
Flags inline `color:#E8911A` / `color:#4A9E82` on text contexts (filtering out
background/border/fill/button uses). Amber and sage both fail AA as text on white.
**Incident:** `Design canon audit fixes: … WCAG contrast` (canon Rule 2). WARN because the
canon's own process is "grep, then human-review" — some flagged lines are legitimate.

### G10 — Head baseline (viewport / charset / canonical / favicon link)
The universal page-type baseline. Searches the real `<head>` block. Canonical coverage was
brought to 179/179 on 2026-06-07.

### G11 — `cl-card-click` present on card pages
Cards are fully clickable via the `cl-card-click` delegation snippet (canon Rule 4/5);
shipping a card page without it strands the click target. Only pages that actually use
cards are checked.

### G12 — Every blog post is in `sitemap.xml`
Orphan-content / SEO-drift backstop. **Incident:** the pipeline audit found 14 live posts
missing from the sitemap; they were backfilled, and this gate keeps them in.

---

## Install (once per clone)

```bash
bash scripts/install-hooks.sh
```

This sets `git config --local core.hooksPath scripts/`, so the version-controlled
`scripts/pre-push` runs before every push. It supersedes the older approach of writing a
hook into `.git/hooks/` — when `core.hooksPath` is set, git uses `scripts/pre-push` and
ignores `.git/hooks/pre-push`. The new `scripts/pre-push` still runs
`scripts/check-conflicts.sh` first, so the merge-conflict-marker protection is preserved.

Bypass for a one-off (use sparingly, and log why in the commit message):

```bash
git push --no-verify
```

---

## Orchestrator wiring

The **All Project Updater** hub pushes via real `git push` (`lib_github_push.py`), not the
GitHub Contents API, so `core.hooksPath` hooks fire automatically on orchestrator pushes —
**as long as the clone the orchestrator pushes from has run `install-hooks.sh` once.**

To wire it: confirm the orchestrator's `repo_workdir` for commonladder points at a clone
where `git config --local core.hooksPath` returns `scripts/`, and run
`bash scripts/install-hooks.sh` there once if not. After that, any CRITICAL regression
refuses the push at the orchestrator boundary, the same as a local push.


---

## Gates added 2026-06-09 (ported from autovetting)

### CL-G13 — No single-quoted JS strings with inner apostrophes
JS object fields like `label: 'Don't...'` break the entire IIFE with `Unexpected identifier 't'`. Fields in inline JS data structures must use double-quoted strings when content contains apostrophes. Same shape as autovetting G7.

### CL-G14 — No debug cruft in shipped JS
`<script>` blocks must not contain `console.log`, `console.debug`, `console.info`, `console.trace`, or `debugger;`. `console.warn` and `console.error` ARE allowed — legitimate runtime error reporting. `alert()` is NOT in the regex — it's a user-prompt UX call (used in tools like budget.html / static-tools navigators), not debug.

### CL-G15 — Every `<img>` has alt attribute
Universal accessibility. Civic-resource site users include screen-reader users and assistive-tech users — alt text is non-negotiable. `alt=""` is acceptable for purely decorative images.

### CL-G16 — `target="_blank"` carries `rel="noopener"`
Tabnabbing protection. Especially critical because the site links out to many external CoC / state / federal sites; `rel="noopener"` prevents the destination from controlling the opener tab via `window.opener`. The gate also caught 14 unsafe external links on benefit-screener.html — all backfilled with `rel="noopener noreferrer"`.

### CL-G17 — Content `<img>`s use `loading="lazy"` (WARN)
Performance — below-the-fold images shouldn't block page load. Exempts logos, favicons, the honeycomb mark, and apple-touch-icon (above-the-fold by definition).
