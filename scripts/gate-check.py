#!/usr/bin/env python3
"""
gate-check.py — pre-push regression gates for commonladder.org.

Codifies the actual regressions Common Ladder has shipped at least once, so they
can never re-ship silently. Run before any push:

    python3 scripts/gate-check.py

Exits 0 if all CRITICAL gates pass, 1 otherwise. WARN gates print but never block.

Modeled on the autovetting gate-check.py. Site-specific gates are derived from the
Common Ladder design canon (footer/GA/shell rules) and from incidents visible in
git history ("Design canon audit fixes: footer, broken links, WCAG contrast, GA tag",
the missing /favicon.svg asset, the flagstaff navigator that shipped without a global
nav). See CommonLadder-Pre-Push-Gates.md for the human-readable rationale per gate.
"""
import json
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
os.chdir(REPO)

GA_ID = "G-3YXK0RL6XV"  # the one canonical Common Ladder GA4 measurement ID

# Pages intentionally outside the brand shell / not audited for canon compliance.
SHELL_EXEMPT = {
    "garden-planner.html",      # intentionally standalone, off-brand utility (design canon Rule 7)
    "test_nav.html",            # scratch file
}
# Template files carry [REPLACE:...] placeholders and intentionally aren't wired/linked.
TEMPLATE_FILES = {
    "help/resource-template.html",
    "static-tools/navigator-template.html",
}
# (Historical) flagstaff-navigator.html once shipped without the global <nav>; it was
# converted to the standard shell on 2026-06-07, so there are no nav-presence exemptions.
NAV_PRESENT_EXEMPT = set()  # flagstaff converted to the standard shell 2026-06-07; no exemptions

CRITICAL_FAIL = []
WARN = []
PASSED = []


def critical(name, ok, detail=""):
    (PASSED.append(("CRIT", name)) if ok else CRITICAL_FAIL.append((name, detail)))


def warn(name, ok, detail=""):
    (PASSED.append(("WARN", name)) if ok else WARN.append((name, detail)))


def rel(p):
    return str(p.relative_to(REPO))


def _read(p):
    return p.read_text(encoding="utf-8", errors="replace")


def is_redirect(p):
    return 'http-equiv="refresh"' in _read(p)[:2500].lower()


def all_pages(include_redirects=False, include_templates=False, include_exempt=True):
    """Every real site HTML page (skips wp-theme, .git, .bak)."""
    out = []
    for p in REPO.rglob("*.html"):
        s = rel(p)
        if s.startswith("wp-theme/") or "/wp-theme/" in s or s.startswith(".git") or s.endswith(".bak"):
            continue
        if not include_templates and s in TEMPLATE_FILES:
            continue
        if not include_exempt and s in SHELL_EXEMPT:
            continue
        if not include_redirects and is_redirect(p):
            continue
        out.append(p)
    return sorted(out)


# ============================================================
# G1 (CRIT) — every inline <script> parses as valid JS
# Incident: the site ships hand-written inline wizard JS on every navigator/tool;
# a single apostrophe-in-single-quotes or missing array comma breaks the whole IIFE.
# ============================================================
def gate_inline_js_syntax():
    script_re = re.compile(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", re.IGNORECASE)
    bad = []
    for p in all_pages(include_templates=True):
        html = _read(p)
        for i, m in enumerate(script_re.finditer(html), 1):
            tag_open = html[m.start():m.start() + 120]
            if 'type="application/' in tag_open or 'type="text/template' in tag_open:
                continue
            if "googletagmanager" in tag_open or "src=" in tag_open:
                continue
            body = m.group(1)
            if len(body.strip()) < 50:
                continue
            r = subprocess.run(
                ["node", "-e", "new Function(require('fs').readFileSync('/dev/stdin','utf8'))"],
                input=body, capture_output=True, text=True, timeout=20)
            if r.returncode != 0:
                first = (r.stderr.strip().splitlines() or ["(no stderr)"])[0]
                bad.append(f"{rel(p)} script #{i}: {first}")
    critical("Inline JS syntax valid (apostrophes, commas)", not bad, "; ".join(bad[:5]))


# ============================================================
# G2 (CRIT) — every JSON-LD block is valid JSON
# Incident: blog posts carry Article schema (page-type spec); a trailing comma or
# unescaped quote silently breaks structured data for the whole post.
# ============================================================
def gate_jsonld_valid():
    ld_re = re.compile(r'<script type="application/ld\+json">([\s\S]*?)</script>', re.IGNORECASE)
    bad = []
    for p in all_pages(include_templates=True):
        for i, m in enumerate(ld_re.finditer(_read(p)), 1):
            try:
                json.loads(m.group(1))
            except Exception as e:
                bad.append(f"{rel(p)} ld#{i}: {e}")
    critical("JSON-LD blocks valid JSON", not bad, "; ".join(bad[:4]))


# ============================================================
# G3 (CRIT) — one GA measurement ID site-wide, present on every non-exempt page
# Incident: "Design canon audit fixes: ... GA tag". Canon Rule 3 requires GA on every
# page except garden-planner. A stray/legacy ID or a missing tag breaks analytics.
# ============================================================
def gate_ga_consistency():
    ids = set()
    missing = []
    for p in all_pages(include_exempt=False):  # garden-planner is exempt
        h = _read(p)
        found = set(re.findall(r"G-[A-Z0-9]{8,}", h))
        ids |= found
        if GA_ID not in found:
            missing.append(rel(p))
    stray = sorted(ids - {GA_ID})
    ok = (not stray) and (not missing)
    detail = ""
    if stray:
        detail += f"stray GA IDs {stray}; "
    if missing:
        detail += f"{len(missing)} page(s) missing {GA_ID}: {missing[:5]}"
    critical("GA tag consistent + present on every page", ok, detail)


# ============================================================
# G4 (CRIT) — global shell present: <nav> + <footer> on every standard page
# Incident: find.html shipped without a <footer> ("the most common omission pattern",
# canon Rule 3); flagstaff-navigator shipped without a global <nav>. Redirect stubs and
# garden-planner are exempt; flagstaff is a tracked editorial exception (see queue).
# ============================================================
def gate_global_shell():
    bad = []
    for p in all_pages(include_exempt=False):
        s = rel(p)
        h = _read(p)
        if "<footer" not in h:
            bad.append(f"{s}: no <footer>")
        if s not in NAV_PRESENT_EXEMPT and "<nav" not in h:
            bad.append(f"{s}: no <nav>")
    critical("Global shell present (nav + footer)", not bad, "; ".join(bad[:6]))


# ============================================================
# G5 (CRIT) — every internal link + the favicon resolve to a real file
# Incident: "Design canon audit fixes: ... broken links" (canon Rule 6); /favicon.svg
# was referenced by 181 pages while the file was missing; a blog post linked the
# nonexistent /help/rental-assistance/. Dynamic JS-built hrefs are skipped.
# ============================================================
def _is_dynamic(href):
    return any(t in href for t in ("'+", "+ '", "' +", "+'", '"+', '+"', "${", "{{", "<%", "[REPLACE"))


def _resolve(href, page):
    if _is_dynamic(href):
        return None
    h = href.split("#")[0].split("?")[0].strip()
    if not h:
        return None
    low = h.lower()
    if low.startswith(("mailto:", "tel:", "sms:", "javascript:", "data:")):
        return None
    if low.startswith(("http://", "https://")):
        if "commonladder.org" not in low:
            return None
        h = re.sub(r"^https?://(www\.)?commonladder\.org", "", h, flags=re.I) or "/"
    if h.startswith("//"):
        return None
    base = (REPO / h.lstrip("/")) if h.startswith("/") else (page.parent / h)
    cands = [base / "index.html"] if h.endswith("/") else [base, base / "index.html"]
    if not h.endswith("/") and not base.suffix:
        cands.append(base.with_name(base.name + ".html"))
    for c in cands:
        try:
            if c.resolve().exists():
                return True
        except Exception:
            pass
    return False


def gate_internal_links_resolve():
    bad = {}
    for p in all_pages():
        h = _read(p)
        # favicon and other rel=icon hrefs count too
        for m in re.finditer(r'href="([^"]+)"', h):
            if _resolve(m.group(1), p) is False:
                bad.setdefault(m.group(1).split("#")[0], set()).add(rel(p))
    flat = [f"{tgt} ({len(pgs)} page(s))" for tgt, pgs in sorted(bad.items(), key=lambda x: -len(x[1]))]
    critical("Internal links + favicon resolve (no 404s)", not bad, "; ".join(flat[:6]))


# ============================================================
# G6 (CRIT) — interactive-page IIFEs evaluate without ReferenceError
# Incident (carried from autovetting G14): a refactor drops a definition but leaves the
# use; the page still "loads" but the wizard silently dies. Eval the largest inline
# script of each key tool in a stubbed DOM and fail only on undefined-identifier errors.
# ============================================================
def gate_runtime_idents_resolve():
    targets = ["find.html", "static-tools/benefit-screener.html",
               "static-tools/tucson-navigator.html", "static-tools/my-ladder.html"]
    stub = """
        var noop=function(){return undefined;};
        var elStub={appendChild:noop,removeChild:noop,setAttribute:noop,getAttribute:noop,
            addEventListener:noop,removeEventListener:noop,classList:{add:noop,remove:noop,toggle:noop,contains:noop},
            style:{},dataset:{},focus:noop,click:noop,querySelector:noop,querySelectorAll:function(){return[];},
            insertAdjacentHTML:noop,closest:noop,scrollIntoView:noop,innerHTML:'',textContent:'',value:'',checked:false};
        var document={getElementById:noop,querySelector:noop,querySelectorAll:function(){return[];},
            createElement:function(){return elStub;},createTextNode:noop,addEventListener:noop,
            body:elStub,documentElement:elStub,head:elStub,cookie:''};
        var localStorage={getItem:noop,setItem:noop,removeItem:noop,clear:noop};
        var sessionStorage=localStorage;
        var location={href:'',search:'',pathname:'/',hash:'',replace:noop,assign:noop,reload:noop};
        var history={pushState:noop,replaceState:noop,back:noop};
        var navigator={userAgent:'',clipboard:{writeText:noop},share:noop};
        var screen={width:1024,height:768};
        var console={log:noop,warn:noop,error:noop,info:noop};
        var window=this;
        window.location=location;window.history=history;window.navigator=navigator;
        window.localStorage=localStorage;window.sessionStorage=sessionStorage;
        window.document=document;window.screen=screen;window.console=console;
        window.addEventListener=noop;window.removeEventListener=noop;window.matchMedia=function(){return{matches:false,addListener:noop,addEventListener:noop};};
        window.scrollTo=noop;window.requestAnimationFrame=noop;window.getComputedStyle=function(){return{};};
        window.setTimeout=noop;window.setInterval=noop;window.clearTimeout=noop;window.clearInterval=noop;
        window.alert=noop;window.print=noop;window.open=noop;window.gtag=noop;window.dataLayer=[];
        window.URLSearchParams=URLSearchParams;window.btoa=function(s){return Buffer.from(s).toString('base64');};
        window.atob=function(s){return Buffer.from(s,'base64').toString();};
    """
    script_re = re.compile(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", re.IGNORECASE)
    bad = []
    for rel_t in targets:
        p = REPO / rel_t
        if not p.exists():
            continue
        h = _read(p)
        biggest = ""
        for m in script_re.finditer(h):
            tag = h[m.start():m.start() + 120]
            if 'type="application/' in tag or "googletagmanager" in tag or "src=" in tag:
                continue
            if len(m.group(1)) > len(biggest):
                biggest = m.group(1)
        if len(biggest.strip()) < 50:
            continue
        r = subprocess.run(
            ["node", "-e", "require('vm').runInNewContext(require('fs').readFileSync('/dev/stdin','utf8'))"],
            input=stub + "\n" + biggest, capture_output=True, text=True, timeout=20)
        if r.returncode != 0:
            err = (r.stderr.strip().splitlines() or ["(no stderr)"])[0]
            if "ReferenceError" in err or "is not defined" in err:
                bad.append(f"{rel_t}: {err}")
    critical("Interactive-page IIFEs have no undefined identifiers", not bad, "; ".join(bad))


# ============================================================
# G7 (CRIT) — nav CTA points to /find.html with the text "Find resources"
# Incident: canon Rule 1 — the amber nav CTA "must point to /find.html". The retired
# targets (/coc-finder.html, "Find help now") regressed in here before and had to be
# reverted (the UX-fixes commit). Cheap, specific backstop.
# ============================================================
def gate_nav_cta():
    bad = []
    for p in all_pages(include_exempt=False):
        h = _read(p)
        if 'class="nav"' not in h and "nav__cta" not in h:
            continue  # standalone-app navigators (flagstaff) handled by G4
        m = re.search(r'<a[^>]*class="nav__cta"[^>]*>(.*?)</a>', h, re.S)
        if not m:
            # page has a nav but no primary CTA link at all
            if "nav__cta" not in h:
                bad.append(f"{rel(p)}: no nav__cta")
            continue
        whole = m.group(0)
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip()
        if 'href="/find.html"' not in whole:
            bad.append(f"{rel(p)}: nav CTA not -> /find.html")
        elif text.lower() != "find resources":
            bad.append(f"{rel(p)}: nav CTA text is '{text}'")
    critical('Nav CTA -> /find.html, text "Find resources"', not bad, "; ".join(bad[:5]))


# ============================================================
# G8 (WARN) — exactly one <h1> per page (SEO + a11y)
# ============================================================
def gate_single_h1():
    bad = []
    for p in all_pages(include_exempt=False):
        n = len(re.findall(r"<h1\b", _read(p), re.IGNORECASE))
        if n != 1:
            bad.append(f"{rel(p)}: {n}")
    warn("Single <h1> per page", not bad, "; ".join(bad[:8]))


# ============================================================
# G9 (WARN) — no amber/sage used as text color (WCAG AA fails on white)
# Incident: "Design canon audit fixes: ... WCAG contrast" (canon Rule 2). Amber #E8911A
# and sage #4A9E82 fail AA as text; flag inline color: uses for human review.
# ============================================================
def gate_wcag_text_color():
    bad = []
    color_re = re.compile(r"color:\s*#(E8911A|4A9E82)\b", re.IGNORECASE)
    for p in all_pages(include_exempt=False):
        for ln, line in enumerate(_read(p).splitlines(), 1):
            if color_re.search(line):
                low = line.lower()
                # allow when it's clearly a fill/background/border/button context
                if any(k in low for k in ("background", "border", "fill", "btn", "button",
                                          "badge", "stroke", "--", "box-shadow",
                                          # nav contexts use dark backgrounds; amber/sage text there is AA-compliant
                                          ".nav__", "nav__wordmark", ".cl-home", "cl-home__")):
                    continue
                bad.append(f"{rel(p)}:{ln}")
    warn("No amber/sage as text color (WCAG AA)", not bad, "; ".join(bad[:8]))


# ============================================================
# G10 (WARN) — universal <head> baseline present (viewport, charset, canonical, favicon link)
# Per the page-type universal baseline. WARN because redirect stubs legitimately vary.
# ============================================================
def gate_head_baseline():
    bad = []
    for p in all_pages(include_exempt=False):
        full = _read(p)
        # search the <head> block (fall back to whole doc); these tags are head-only
        hm = re.search(r"<head\b[^>]*>([\s\S]*?)</head>", full, re.IGNORECASE)
        h = hm.group(1) if hm else full
        s = rel(p)
        miss = []
        if 'name="viewport"' not in h:
            miss.append("viewport")
        if not re.search(r'charset=', h, re.IGNORECASE):
            miss.append("charset")
        if 'rel="canonical"' not in h:
            miss.append("canonical")
        if 'rel="icon"' not in h:
            miss.append("favicon-link")
        if miss:
            bad.append(f"{s}: {','.join(miss)}")
    warn("Head baseline (viewport/charset/canonical/favicon)", not bad, "; ".join(bad[:8]))


# ============================================================
# G11 (WARN) — cl-card-click delegation script present (canon Rule 4/5)
# Cards are fully clickable via this snippet; shipping a card page without it strands
# the click target. Only flag pages that actually use cards.
# ============================================================
def gate_card_click_present():
    bad = []
    for p in all_pages(include_exempt=False):
        h = _read(p)
        if ("post-card" in h or 'class="card' in h) and "cl-card-click" not in h:
            bad.append(rel(p))
    warn("cl-card-click present on card pages", not bad, "; ".join(bad[:8]))


# ============================================================
# G12 (WARN) — every published blog post is in sitemap.xml (orphan-content backstop)
# Incident: the pipeline audit found 14 live posts missing from the sitemap (SEO drift).
# ============================================================
def gate_blog_in_sitemap():
    sm = _read(REPO / "sitemap.xml")
    locs = set(re.findall(r"<loc>([^<]+)</loc>", sm))
    norm = {l.rstrip("/").lower() for l in locs}
    bad = []
    for p in sorted(REPO.glob("blog/*.html")):
        url = f"https://commonladder.org/{rel(p)}".lower()
        if url not in norm and url.rstrip("/") not in norm:
            bad.append(rel(p))
    warn("Every blog post is in sitemap.xml", not bad, "; ".join(bad[:8]))


# ============================================================
# CL-G13 (CRIT) — no single-quoted JS strings with inner apostrophes
# Catches: 'Don't' / 'won't' patterns that break IIFE parsing
# ============================================================
def gate_no_unsafe_apostrophes():
    bad = []
    pat = re.compile(r"^(?:\s+)?(?:label|title|name|desc|text|tagline|summary|caption|sub):\s*'[^']*[A-Za-z]'[A-Za-z]", re.MULTILINE)
    for p in all_pages(include_exempt=False):
        for ln, line in enumerate(_read(p).splitlines(), 1):
            if pat.search(line):
                bad.append(f"{rel(p)}:{ln}")
                if len(bad) >= 5:
                    break
        if len(bad) >= 5:
            break
    critical("No single-quoted JS strings with inner apostrophes", not bad, "; ".join(bad))


# ============================================================
# CL-G14 (CRIT) — no debug cruft in shipped JS
# (console.warn/error allowed; legitimate error reporting)
# ============================================================
def gate_no_debug_cruft():
    bad = []
    script_re = re.compile(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", re.IGNORECASE)
    # alert() is a user-prompt UX pattern, not debug cruft — leave it out.
    debug_re = re.compile(r"\b(console\.(?:log|debug|info|trace)|debugger\s*;)")
    for p in all_pages(include_exempt=False):
        h = _read(p)
        for m in script_re.finditer(h):
            tag = h[m.start():m.start() + 100]
            if 'type="application/' in tag or "googletagmanager" in tag:
                continue
            body = m.group(1)
            dm = debug_re.search(body)
            if dm:
                bad.append(f"{rel(p)}: {dm.group(0)}")
                if len(bad) >= 5:
                    break
        if len(bad) >= 5:
            break
    critical("No debug cruft (console.log / debugger)", not bad, "; ".join(bad))


# ============================================================
# CL-G15 (CRIT) — every <img> has alt attribute
# Catches: accessibility omissions on a civic-resource site
# ============================================================
def gate_img_alt_text():
    bad = []
    for p in all_pages(include_exempt=False):
        h = _read(p)
        for m in re.finditer(r"<img\b[^>]*>", h):
            tag = m.group(0)
            if "alt=" not in tag:
                bad.append(f"{rel(p)}: {tag[:120]}")
                if len(bad) >= 5:
                    break
        if len(bad) >= 5:
            break
    critical("Every <img> has alt attribute", not bad, "; ".join(bad))


# ============================================================
# CL-G16 (CRIT) — target="_blank" carries rel="noopener"
# Catches: tabnabbing — especially critical with many external CoC links
# ============================================================
def gate_external_link_safety():
    bad = []
    for p in all_pages(include_exempt=False):
        h = _read(p)
        for m in re.finditer(r'<a\s[^>]*target="_blank"[^>]*>', h):
            tag = m.group(0)
            rel_attr = re.search(r'rel="([^"]*)"', tag)
            if not rel_attr or "noopener" not in rel_attr.group(1):
                bad.append(f"{rel(p)}: {tag[:100]}")
                if len(bad) >= 5:
                    break
        if len(bad) >= 5:
            break
    critical("target=_blank carries rel=noopener", not bad, "; ".join(bad))


# ============================================================
# CL-G17 (WARN) — content <img>s should have loading="lazy"
# Allow eager loading on logos/favicons/honeycomb mark
# ============================================================
def gate_lazy_load_imgs():
    ALLOW_EAGER = ("logo-", "favicon", "icon-mark", "apple-touch-icon", "honeycomb")
    bad = []
    for p in all_pages(include_exempt=False):
        h = _read(p)
        for m in re.finditer(r"<img\b[^>]*>", h):
            tag = m.group(0)
            src_m = re.search(r'src="([^"]+)"', tag)
            if not src_m:
                continue
            src = src_m.group(1)
            if any(s in src for s in ALLOW_EAGER):
                continue
            if 'loading="lazy"' not in tag:
                bad.append(f"{rel(p)}: {src}")
                if len(bad) >= 6:
                    break
        if len(bad) >= 6:
            break
    warn("Content imgs use loading=lazy", not bad, "; ".join(bad))





# ============================================================
# G18 (CRITICAL) — skip-link target exists
# Incident: docs/accessibility-audit.md 2026-05-24 Critical #1 — every page links
# href="#main" but ~100 pages had no id="main", so the skip link clicked into the
# void (WCAG 2.4.1). Fixed fleet-wide 2026-06-10 (cl-skiplinks-2026-06-10).
# ============================================================
def gate_skip_link_target():
    bad = []
    for p in all_pages(include_exempt=False):
        s = _read(p)
        for anchor in set(re.findall(r'class="skip-link"[^>]*href="#([\w-]+)"', s) + re.findall(r'href="#([\w-]+)"[^>]*class="skip-link"', s)):
            if f'id="{anchor}"' not in s:
                bad.append(f"{rel(p)}: #{anchor}")
    critical("Skip-link target exists (id matches skip-link href)", not bad, "; ".join(bad[:8]))



# ============================================================
# G19 (CRITICAL) — wizard CSS isolation
# Incident 2026-06-11: the 2026-06-08 shell rollout added /style.css to navigator
# pages; its listing-card rules (.card padding:0/flex/pointer, child margins, .btn,
# .section-head) loaded after each wizard's inline <style> and collapsed wizard
# padding (screenshot: tucson welcome card). Any page that mounts a JS wizard in
# #app AND loads /style.css must carry the cl-css-isolation guard, and its
# cl-card-click snippet must skip #app cards.
# ============================================================
def gate_wizard_css_isolation():
    bad = []
    for p in all_pages(include_exempt=False):
        s = _read(p)
        if 'id="app"' not in s or "/style.css" not in s or "<style>" not in s:
            continue
        if "cl-css-isolation" not in s:
            bad.append(f"{rel(p)}: missing cl-css-isolation guard")
        if 'data-id="cl-card-click"' in s and "el.closest('#app')" not in s:
            bad.append(f"{rel(p)}: cl-card-click not excluding #app")
    critical("Wizard CSS isolated from global stylesheet", not bad, "; ".join(bad[:8]))


# ============================================================
# CL-G20 (WARN) — footer <time> stamp must equal JSON-LD dateModified
# Root cause history: commit 66d8c85 (2026-07-30) updated JSON-LD
# dateModified + byline but not the footer <time> element that
# cl-freshness-guard actually reads, so four freshly-verified pages
# showed visitors a false "this may be stale" banner. The 2026-08-03
# verification run fixed those four by hand and noted "nothing enforces
# dateModified == footer <time>; this will recur without a gate."
# The 2026-08-08 audit then found 18 more. This is that gate.
# ============================================================
def gate_footer_time_matches_datemodified():
    bad = []
    for p in sorted(REPO.rglob("*.html")):
        r = rel(p)
        if r.startswith(("wp-theme/", "garden-planner")):
            continue
        s = _read(p)
        ft = re.findall(r'<time datetime="(\d{4}-\d{2}-\d{2})"', s)
        dm = re.findall(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', s)
        if ft and dm and ft[-1] != dm[-1]:
            bad.append(f"{r}: footer {ft[-1]} != dateModified {dm[-1]}")
    warn("Footer <time> matches JSON-LD dateModified", not bad, "; ".join(bad[:8]))


# ============================================================
# G-RECORDS (CRIT) — canonical resource records (data/resource-records.json)
# Incident 2026-10-25/26: an external accuracy audit found ~20 wrong or fabricated
# provider listings in help/*, resources.html and shelter-finder-az.html — a defunct
# youth shelter marked "Verified May 2026", a veterans program listed for the wrong
# population, the DCS child-abuse hotline presented as family support. The fix made
# data/resource-records.json the single source of truth for those services. This gate
# stops any retired (known-wrong) value or suppressed listing from coming back.
#   scope "global"        -> flagged on every page (except files in allow_in)
#   scope "near-org"      -> flagged only within `window` chars after `near`
#   scope "arizona-pages" -> exempts the non-AZ city stub navigators
# Phone values carry `digits` and match tel: hrefs and any display format.
# ============================================================
NON_AZ_STUB_RE = re.compile(r"^static-tools/(?!maricopa|tucson|flagstaff|san-joaquin)[a-z0-9-]+-navigator\.html$")


def _phone_spans(s, digits):
    d = digits[-10:]
    a, b, c = d[:3], d[3:6], d[6:]
    pats = [rf"tel:\+?1?{d}(?!\d)", rf"(?<!\d)\(?{a}\)?[\s.\-]?{b}[\s.\-]{c}(?!\d)"]
    out = []
    for pat in pats:
        out += [m.start() for m in re.finditer(pat, s)]
    return out


def gate_canonical_records():
    name = "Canonical resource records: no retired values or suppressed listings"
    path = REPO / "data" / "resource-records.json"
    if not path.exists():
        critical(name, False, "data/resource-records.json missing")
        return
    recs = json.loads(path.read_text(encoding="utf-8"))["records"]
    pages = [(rel(p), _read(p)) for p in all_pages(include_exempt=False)]
    bad = []
    for r in recs:
        for v in r.get("retired", []):
            scope = v.get("scope", "global")
            allow = set(v.get("allow_in", []))
            for pname, s in pages:
                if pname in allow:
                    continue
                if scope == "arizona-pages" and NON_AZ_STUB_RE.match(pname):
                    continue
                if "digits" in v:
                    spans = _phone_spans(s, v["digits"])
                else:
                    spans = [m.start() for m in re.finditer(re.escape(v["value"]), s)]
                if scope == "near-org":
                    near, win = v["near"], int(v.get("window", 900))
                    spans = [i for i in spans if near in s[max(0, i - win):i]]
                if spans:
                    bad.append(f"{pname}: '{v['value']}' [{r['id']}: {v['reason']}]")
    detail = "; ".join(bad[:8]) + (f" (+{len(bad) - 8} more)" if len(bad) > 8 else "")
    critical(name, not bad, detail)


# ============================================================
# G-211 (CRIT) — never claim 211 answers around the clock
# Incident 2026-10-26: 211 Arizona's live operators answer 9 a.m.-7 p.m. daily, but
# ~110 sentences said "211 ... 24/7", including the finder and "...Tonight" pages,
# sending people to a line nobody answers at night. Out-of-state 211 hours vary and
# are not verified. Any sentence asserting 211 is 24/7 / around the clock / 24 hours
# fails, unless the same span negates it ("not a 24-hour line").
# ============================================================
_211_247 = re.compile(r"(?:2-1-1|\b211\b)(?:(?!\bnot\b)[^.<\n]){0,90}?(?:24/7|24 hours a day|24-hour|around the clock)", re.I)


def gate_211_hours():
    bad = []
    for p in all_pages(include_exempt=False):
        s = _read(p)
        for m in _211_247.finditer(s):
            t = re.sub(r"<[^>]+>", "", m.group(0))
            bad.append(f"{rel(p)}: '{t[:70]}'")
    critical("211 never described as 24/7 (AZ: 9am-7pm; elsewhere hours vary)", not bad, "; ".join(bad[:6]) + (f" (+{len(bad)-6} more)" if len(bad) > 6 else ""))


# ============================================================
# G-LABELS (CRIT) — no unearned "Verified" labels
# Incident 2026-10-26: 36 help/* cards said "Verified May 2026" though no help/* page had
# ever been through a verification run, and several of them were wrong or fabricated.
# A card may claim confirmation only if it is rendered from data/resource-records.json
# (data-record="..."), which carries its evidence and date.
# ============================================================
def gate_honest_verification_labels():
    bad = []
    for p in all_pages(include_exempt=False):
        s = _read(p)
        for m in re.finditer(r'<p class="card-verified"><small>(Verified|Confirmed)\b', s):
            st = s.rfind('<div class="card"', 0, m.start())
            if 'data-record="' not in s[st:m.start()]:
                bad.append(f"{rel(p)}:{s[:m.start()].count(chr(10)) + 1}")
    critical("No unearned 'Verified' card labels (only store-rendered cards may claim it)", not bad, "; ".join(bad[:8]))


# ============================================================
# G-MAPS (CRIT) — no map pin for a place you cannot walk into
# Incident 2026-10-26: empty maps.google.com/?q= links were wrapped around "Confidential
# address — call for intake" on two DV shelters, the DV hotline and the 988 line, and a
# P.O. Box was pinned to a town. A map link must point at a real, public walk-in address.
# ============================================================
_MAPLINK = re.compile(r'<a href="https?://(?:www\.)?(?:maps\.google\.com|google\.com/maps)[^"]*\?q=([^"&]*)[^"]*"[^>]*>(.*?)</a>', re.S)
_NO_PIN = re.compile(r"P\.?\s?O\.?\s?Box|confidential|phone only|no physical location|call for (the )?(address|location|intake)", re.I)


def gate_no_bogus_map_pins():
    bad = []
    for p in all_pages(include_exempt=False):
        s = _read(p)
        for m in _MAPLINK.finditer(s):
            q, txt = m.group(1).strip(), re.sub(r"<[^>]+>", "", m.group(2))
            if not q or _NO_PIN.search(txt) or _NO_PIN.search(q.replace("+", " ")):
                bad.append(f"{rel(p)}:{s[:m.start()].count(chr(10)) + 1} '{txt[:40]}'")
    critical("No map pins on empty, P.O. Box, phone-only or confidential addresses", not bad, "; ".join(bad[:8]))


def main():
    gates = [
        gate_inline_js_syntax, gate_jsonld_valid, gate_ga_consistency,
        gate_global_shell, gate_internal_links_resolve, gate_runtime_idents_resolve,
        gate_no_unsafe_apostrophes, gate_no_debug_cruft, gate_img_alt_text,
        gate_external_link_safety,
        gate_nav_cta, gate_single_h1, gate_wcag_text_color, gate_head_baseline,
        gate_card_click_present, gate_blog_in_sitemap, gate_lazy_load_imgs,
        gate_skip_link_target, gate_wizard_css_isolation,
        gate_footer_time_matches_datemodified,
        gate_canonical_records,
        gate_211_hours,
        gate_honest_verification_labels,
        gate_no_bogus_map_pins,
    ]
    for g in gates:
        try:
            g()
        except Exception as e:
            critical(g.__name__, False, f"check itself errored: {e}")

    print("\n=== commonladder pre-push gates ===\n")
    for kind, name in PASSED:
        print(f"  [{kind} PASS]  {name}")
    for name, detail in WARN:
        print(f"  [WARN     ]  {name}")
        if detail:
            print(f"               -> {detail}")
    for name, detail in CRITICAL_FAIL:
        print(f"  [CRIT FAIL]  {name}")
        if detail:
            print(f"               -> {detail}")
    print(f"\nResult: {len(PASSED)} passed, {len(WARN)} warned, {len(CRITICAL_FAIL)} CRITICAL failed.\n")
    sys.exit(1 if CRITICAL_FAIL else 0)


if __name__ == "__main__":
    main()
