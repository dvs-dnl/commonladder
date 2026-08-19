# Tax Ladder — Act 2 and Act 3 build toolchain

**Nothing in this folder ships to a visitor.** These are build-time and test-time
artefacts for `learn/tax-explorer/index.html` and `learn/tax-explorer/methodology.html`.
Those two files are the only deployed output.

## Why the page is generated rather than hand-edited

The Act 2 engine has to satisfy two audiences at once: a headless test runner and a
browser. If the page carried its own copy of the model, the two would drift, and a
passing test suite would stop meaning anything. So the engine and its data payload
live here once, the tests exercise those files directly, and `inject-act2.js`
splices the same bytes into the page.

**Edit the files here, then re-run the pipeline. Do not hand-edit the injected
regions in `index.html`** — they are bounded by `ACT2:BEGIN` / `ACT2:END` markers
and will be overwritten.

## The pipeline

Run from the repo root (`github/commonladder-theme/`):

```bash
node scripts/tax-explorer/build-act2-data.js    # data/*.json -> act2-data.json + act3-provenance.json
node scripts/tax-explorer/test-model.js         # 22 headless tests, must be green
node scripts/tax-explorer/inject-act2.js        # splice data + engine + cards + UI into index.html
node scripts/tax-explorer/build-methodology.js  # generate methodology.html from data/ + provenance

# the live half — needs playwright and a static server for the site root
python3 -m http.server 8099 &
node scripts/tax-explorer/smoke-act2.js         # 53 live checks across both pages
```

If the sandbox's pinned Chromium does not match the installed playwright build,
`smoke-act2.js` falls back to `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`;
override with `PW_CHROMIUM=/path/to/chrome`.

`inject-act2.js` is idempotent: running it twice produces a byte-identical file.

## Files

| File | What it is |
|---|---|
| `build-act2-data.js` | Selects and reshapes `learn/tax-explorer/data/*.json` into a minified payload. Introduces **no** figures; it only picks and re-keys. Verifies the SOI Table 3.5 column indices arithmetically (income × rate must equal tax at rate) and fails loudly if a column ever moves. |
| `act2-data.json` | The generated payload, ~28 KB. Regenerate, never hand-edit. |
| `model.js` | The engine: `model(levers, assumptions) → results`. Pure, deterministic, no I/O, no libraries. Runs under node and in the browser from the same source. |
| `test-model.js` | The 14 headless tests — gameplan §9's nine model cases plus five invariants Phase 0's findings made load-bearing. **Written before the engine.** |
| `ui/act2-section.html.part` | The Act 2 markup: lever panel and output containers. |
| `ui/act2.css` | Act 2 styles, `tx-` prefixed, appended to the page's own `<style>` block. |
| `ui/act2-ui.js` | Reads the form, calls the model, renders. Holds no policy logic of its own. |
| `inject-act2.js` | Splices all of the above into `learn/tax-explorer/index.html`. |
| `act3-cards.js` | The twelve scenario cards — a stored `levers` object and its copy per card — plus the `?s=` URL-state codec. Pure, no I/O; runs under node and in the browser from the same source. **It holds no figures**: every number comes from `act2-data.json > cards`, which the builder reads out of `data/` by path. |
| `act3-provenance.json` | The same card figures WITH the verbatim source lines. Not injected into the page — it is ~37 KB and the page has a weight budget. `build-methodology.js` renders it. |
| `ui/act3-section.html.part` | Act 3 markup: the share bar, the card grid container, honesty note 16. |
| `ui/act3.css` | Act 3 styles, `tx3-` prefixed. |
| `ui/act3-ui.js` | Renders the cards, applies a preset by writing the Act 2 controls and calling its `update()`, and reads/writes `?s=`. Holds no policy logic and never calls the model to produce a headline. |
| `build-methodology.js` | Generates `learn/tax-explorer/methodology.html` — prose from `ui/methodology-body.html`, every table read out of `data/` at build time. |
| `ui/methodology-body.html.part` | The methodology page's prose: the ten-year convention, the four derivations, the PolicyEngine deviation, the OBBBA baseline problem, the never-claim list. |
| `smoke-act2.js` | 53 live browser checks across `index.html` and `methodology.html`: the guardrails must hold on screen, not only in the engine. |

## Two traps worth remembering

1. **`String.replace` with a string replacement interprets `$&`, `` $` `` and `$'`.**
   The engine's currency formatter contains `'-$'`, which was silently mangled on
   injection and produced an unparseable script. Every insertion in `inject-act2.js`
   uses a *function* replacement for that reason.
2. **An HTML comment inside a `<style>` block is a CSS parse error** that swallows the
   rule after it. The CSS region therefore uses `/* ACT2:BEGIN css */` markers while
   every other region uses HTML comments.

## Why a scenario card is not a second scoring path

A card is a stored `levers` object. Tapping it writes those values into the Act 2
controls and lets the existing render loop run. It does not compute its own
numbers. If it did, the card and the sandbox would drift, and the test that says
"every card's displayed figures match `data/` exactly" would be checking a copy.

The one thing a card *does* carry is the published score of the policy it
represents — from a scorekeeper, over that scorekeeper's window, against that
scorekeeper's baseline. Where that figure and the engine's own differ, both are
shown with the reason. That contrast is the point.

## A third trap, from Phase 3

`String.prototype.split` on a sentence boundary and a `textContent` scan will both
happily read a *quotation* as an assertion. The never-claim scans exclude
`blockquote.meth-q` and the source-title links inside provenance tables, because
several of the papers cited are titled with the very phrase they exist to refute
("Did the 2017 tax cut pay for itself?"). The list governs what this tool says,
not what it quotes.

## Why the markup fragments end in `.html.part`

`scripts/gate-check.py` sweeps `REPO.rglob("*.html")` and audits every match as a
served page — global shell, GA tag, nav CTA. The Act 2 markup fragment was matched
by that sweep and failed two CRITICAL gates ("no `<footer>`, no `<nav>`", "missing GA
tag") on 2026-08-15, which would block the hourly pusher for every Ready block, not
just this one. The fragments are not pages and never will be; renaming them out of
the `*.html` glob fixes it from this side of the line, without editing
`gate-check.py`, which this block does not own.
