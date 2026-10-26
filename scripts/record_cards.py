#!/usr/bin/env python3
"""
record_cards.py — render resource cards from data/resource-records.json.

Any card on the site written as  <div class="card" data-record="<id>" ...>  is
generated from the canonical record with that id. To correct a service, edit its
record in data/resource-records.json and run:

    python3 scripts/record_cards.py sync          # re-render every data-record card
    python3 scripts/record_cards.py sync --check  # exit 1 if any card is stale

Facts (who, hours, address, phone, cost, provenance) come only from the record.
This file holds presentation only (titles, tags, badge text).

Two card styles exist on the site and both are supported:
  help      — help/*/index.html  (<h3>, .card-tags, dl.resource-details)
  resources — resources.html     (<h4>, .resource-badge, icon grid)
"""
import html, json, re, sys, urllib.parse
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STORE = REPO / "data" / "resource-records.json"
CORRECTIONS = "corrections.commonladder@gmail.com"

# ---- presentation only -----------------------------------------------------
DISPLAY = {
    "brian-garcia-welcome-center": ("Brian Garcia Welcome Center — start here (single adults)", ["Single adults", "Walk in", "Key Campus"]),
    "cass-single-adult-shelter": ("CASS — Single Adult Shelter", ["Emergency shelter", "Open 24/7", "Men &amp; women 18+"]),
    "family-housing-hub": ("Family Housing Hub — family shelter entry", ["Families", "Phone screening", "Waiting list"]),
    "youth-hotline": ("24/7 Youth Hotline (ages 12–17)", ["Youth", "24/7", "Shelter"]),
    "mana-house": ("MANA House — veterans transitional housing", ["Veterans", "Referral only"]),
    "ozanam-manor": ("Ozanam Manor — transitional housing", ["55+ / disability / working", "Phone screening"]),
    "svdp-phoenix-dining-room": ("St. Vincent de Paul — Phoenix Dining Room", ["Meals", "Overnight beds", "Walk in"]),
    "svdp-nextphase-family-dining": ("St. Vincent de Paul — NextPhase Family Dining Room", ["Families with kids", "Dinner Mon–Fri"]),
    "andre-house": ("Andre House — meals, showers, laundry, clothing", ["Hot dinner", "Showers", "Laundry", "Clothing"]),
    "st-marys-neighborhood-food-center": ("St. Mary's Food Bank — Phoenix Neighborhood Food Center", ["Groceries", "Walk in / drive-thru"]),
    "maricopa-vital-records": ("Maricopa County — Birth Certificates (Vital Registration)", ["Birth certificate", "Same-day", "$20"]),
    "circle-the-city-downtown": ("Circle the City — Downtown Family Health Center", ["Health care", "Open weekends"]),
    "circle-the-city-parsons": ("Circle the City — Parsons Family Health Center", ["Health care"]),
    "native-health-central": ("NATIVE HEALTH Central", ["Medical", "Dental", "Behavioral health"]),
    "terros-health": ("Terros Health", ["Mental health", "Substance use", "Primary care"]),
    "child-crisis-arizona-shelter": ("Child Crisis Arizona — Emergency Children's Shelter (ages 2–10)", ["Children only", "24/7"]),
    "dcs-child-abuse-hotline": ("Arizona DCS — Child Abuse Hotline (reports only)", ["Report abuse or neglect"]),
    "community-legal-services": ("Community Legal Services", ["Free civil legal aid", "Apply online or by phone"]),
    "the-worker": ("St. Joseph the Worker (now “The Worker”)", ["Jobs", "Workforce housing"]),
    "phoenix-rescue-mission": ("Phoenix Rescue Mission", ["Recovery", "Outreach", "Food"]),
    "paz-de-cristo": ("Paz de Cristo — Mesa day center (no beds)", ["Meals", "Showers", "East Valley"]),
    "umom": ("UMOM New Day Centers", ["Families", "Single women"]),
    "salvation-army-phoenix-shelter": ("The Salvation Army — family shelter", ["Through the Family Housing Hub"]),
    "united-food-bank": ("United Food Bank — East Valley pantries", ["Food", "Find a pantry"]),
    "crisis-response-network": ("Crisis Response Network — 24/7 crisis line", ["Mental health crisis", "24/7"]),
    "dv-centralized-screening": ("Domestic violence shelter screening line", ["Domestic violence", "24/7", "Confidential"]),
    "va-crrc": ("Phoenix VA — Community Resource & Referral Center", ["Veterans", "Walk in"]),
}

PIN = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>'
PHONE = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.6 17.6 0 0 0 4.168 6.608 17.6 17.6 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.68.68 0 0 0-.58-.122l-2.19.547a1.75 1.75 0 0 1-1.657-.459L5.482 8.062a1.75 1.75 0 0 1-.46-1.657l.548-2.19a.68.68 0 0 0-.122-.58L3.654 1.328z"/></svg>'
CLOCK = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm0-14a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm.5 3a.5.5 0 0 0-1 0v3.5l3 1.8a.5.5 0 1 0 .5-.86L8.5 8.1V5z"/></svg>'

MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]


def load():
    data = json.loads(STORE.read_text(encoding="utf-8"))
    return {r["id"]: r for r in data["records"]}


def e(x):
    return html.escape(str(x), quote=False)


def fmt_date(iso):
    d = date.fromisoformat(iso)
    return f"{MONTHS[d.month - 1]} {d.day}, {d.year}"


def disp_phone(phone, tel):
    t = re.sub(r"\D", "", tel or "")
    if len(t) == 10:
        return f"({t[:3]}) {t[3:6]}-{t[6:]}"
    return phone


def map_url(addr):
    q = re.sub(r"[.,#]", "", addr)
    q = re.sub(r"\s+", "+", q.strip())
    return "https://maps.google.com/?q=" + q


def site_label(url):
    return re.sub(r"^https?://(www\.)?", "", url).split("/")[0]


def report_link(rec, page):
    subj = f"Correction: {rec['org']} ({page})"
    href = f"mailto:{CORRECTIONS}?subject=" + urllib.parse.quote(subj)
    return f'<a href="{html.escape(href)}">Report a problem</a>'


def provenance(rec, page):
    v = rec.get("verified", {})
    method, when = v.get("method", ""), fmt_date(v.get("date", "2026-01-01"))
    org_short = rec["org"].split(" — ")[0].split(" (")[0]
    if rec["status"] == "route":
        text = f"We could not confirm a direct listing on {e(org_short)}’s own site · checked {when}"
    elif method.startswith("operator"):
        text = f"Confirmed on {e(org_short)}’s own website · {when}"
    elif method.startswith("county"):
        text = f"Confirmed in Maricopa County’s published brochure · {when}"
    elif method.startswith("listed by"):
        text = f"{e(method[0].upper() + method[1:])} · {when}"
    else:
        text = f"Checked {when}"
    return f"{text} · {report_link(rec, page)}"


def phones(rec):
    out = []
    if rec.get("tel"):
        lab = f" — {e(rec['phone_label'])}" if rec.get("phone_label") else ""
        out.append(f'<a href="tel:{rec["tel"]}">{e(disp_phone(rec["phone"], rec["tel"]))}</a>{lab}')
    for alt in rec.get("phone_alt", []):
        out.append(f'{e(alt["label"])}: <a href="tel:{alt["tel"]}">{e(disp_phone(alt["phone"], alt["tel"]))}</a>')
    return out


def where(rec):
    """Map link only for a public walk-in address. Referral-only, phone-screened or
    confidential sites get plain text — never a map pin."""
    if rec.get("locations"):
        return "<br>".join(e(x) for x in rec["locations"])
    a = rec.get("address")
    if not a:
        return None
    if rec.get("walk_in") is True and not rec.get("confidential"):
        return f'<a href="{map_url(a)}" rel="noopener" target="_blank">{e(a)}</a>'
    return e(a)


def render_help(rec, page):
    title, tags = DISPLAY.get(rec["id"], (rec["org"], []))
    tag_html = "".join(f'<span class="tag">{t}</span>' for t in tags)
    rows = []
    if rec.get("audience"):
        rows.append(("Who it’s for", e(rec["audience"])))
    if rec.get("hours"):
        rows.append(("Hours", "<br>".join(e(h) for h in rec["hours"])))
    w = where(rec)
    if w:
        rows.append(("Locations" if rec.get("locations") else "Where", w))
    ph = phones(rec)
    if ph:
        rows.append(("Phone", "<br>".join(ph)))
    if rec.get("bring"):
        rows.append(("Bring", e(", ".join(rec["bring"]))))
    if rec.get("cost"):
        rows.append(("Cost", e(rec["cost"])))
    if rec.get("website"):
        rows.append(("Website", f'<a href="{e(rec["website"])}" target="_blank" rel="noopener">{e(site_label(rec["website"]))}</a>'))
    dl = "\n".join(f"            <dt>{k}</dt><dd>{v}</dd>" for k, v in rows)
    note = ""
    if rec.get("conflicts"):
        note = f'\n          <p class="card-note"><small><strong>Heads up:</strong> {e(" ".join(rec["conflicts"]))}</small></p>'
    access = f'\n          <p class="card-access"><strong>What to do:</strong> {e(rec["access"])}</p>' if rec.get("access") else ""
    return (f'<div class="card" data-record="{rec["id"]}">\n'
            f'          <h3>{e(title)}</h3>\n'
            f'          <div class="card-tags">{tag_html}</div>{access}\n'
            f'          <dl class="resource-details">\n{dl}\n          </dl>{note}\n'
            f'          <p class="card-verified"><small>{provenance(rec, page)}</small></p>\n'
            f'        </div>')


def render_resources(rec, page, open_tag, badge_span):
    title, tags = DISPLAY.get(rec["id"], (rec["org"], []))
    badge = re.sub(r">[^<]*</span>$", f">{tags[0] if tags else ''}</span>", badge_span) if badge_span else ""
    if 'data-record=' not in open_tag:
        open_tag = open_tag.replace('<div class="card"', f'<div class="card" data-record="{rec["id"]}"', 1)
    else:
        open_tag = re.sub(r'data-record="[^"]*"', f'data-record="{rec["id"]}"', open_tag)
    lines = []
    w = where(rec)
    lines.append(f"<span>{PIN} {w if w else 'Location given at intake — call first'}</span>")
    for p in phones(rec):
        lines.append(f"<span>{PHONE} {p}</span>")
    if rec.get("hours"):
        lines.append(f"<span>{CLOCK} {' · '.join(e(h) for h in rec['hours'])}</span>")
    if rec.get("website"):
        lines.append(f'<span><a href="{e(rec["website"])}" target="_blank" rel="noopener">{e(site_label(rec["website"]))}</a></span>')
    grid = "\n            ".join(lines)
    desc = e(rec.get("access", ""))
    if rec.get("audience"):
        desc = f"{desc} <em>For:</em> {e(rec['audience'])}"
    return (f'{open_tag}\n'
            f'          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:.5rem;">\n'
            f'            <h4 style="margin:0; color:var(--blue);">{e(title)}</h4>\n'
            f'            {badge}\n'
            f'          </div>\n'
            f'          <p style="margin:.5rem 0; color:var(--gray); font-size:.95rem;"><strong>What to do:</strong> {desc}</p>\n'
            f'          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:.4rem; font-size:.9rem; color:var(--gray);">\n'
            f'            {grid}\n'
            f'          </div>\n'
            f'          <p style="margin:.6rem 0 0; font-size:.8rem; color:var(--gray);">{provenance(rec, page)}</p>\n'
            f'        </div>')


def card_span(s, start):
    """(start, end) of the balanced <div ...> beginning at `start`."""
    depth = 0
    for m in re.finditer(r"<div\b|</div>", s[start:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return start, start + m.end()
    raise ValueError("unbalanced card at %d" % start)


def render_for(page, rec, old):
    if page == "resources.html":
        open_tag = re.match(r"<div[^>]*>", old).group(0)
        bm = re.search(r'<span class="resource-badge[^"]*"[^>]*>[^<]*</span>', old)
        return render_resources(rec, page, open_tag, bm.group(0) if bm else "")
    return render_help(rec, page)


def sync(check=False):
    recs = load()
    stale = []
    for p in sorted(REPO.rglob("*.html")):
        rel = str(p.relative_to(REPO))
        if rel.startswith((".git", "wp-theme")):
            continue
        s = p.read_text(encoding="utf-8")
        if 'data-record="' not in s:
            continue
        out, pos = [], 0
        for m in re.finditer(r'<div class="card"[^>]*data-record="([a-z0-9-]+)"', s):
            st, en = card_span(s, m.start())
            if st < pos:
                continue
            rid = m.group(1)
            if rid not in recs:
                raise SystemExit(f"{rel}: card references unknown record '{rid}'")
            new = render_for(rel, recs[rid], s[st:en])
            out.append(s[pos:st]); out.append(new); pos = en
        out.append(s[pos:])
        ns = "".join(out)
        if ns != s:
            stale.append(rel)
            if not check:
                p.write_text(ns, encoding="utf-8")
    return stale


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "sync":
        chk = "--check" in sys.argv
        st = sync(check=chk)
        if chk:
            print("stale cards in:", ", ".join(st) if st else "none")
            sys.exit(1 if st else 0)
        print("re-rendered:", ", ".join(st) if st else "nothing changed")
    else:
        print(__doc__)
