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
                                          "badge", "stroke", "--", "box-shadow")):
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
        url = f"https://www.commonladder.org/{rel(p)}".lower()
        if url not in norm and url.rstrip("/") not in norm:
            bad.append(rel(p))
    warn("Every blog post is in sitemap.xml", not bad, "; ".join(bad[:8]))


def main():
    gates = [
        gate_inline_js_syntax, gate_jsonld_valid, gate_ga_consistency,
        gate_global_shell, gate_internal_links_resolve, gate_runtime_idents_resolve,
        gate_nav_cta, gate_single_h1, gate_wcag_text_color, gate_head_baseline,
        gate_card_click_present, gate_blog_in_sitemap,
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
