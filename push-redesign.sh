#!/bin/bash
# One-shot script: commit the site-wide redesign + push to commonladder.org
# Run from anywhere — script cd's to the repo itself.

set -e

cd "$(dirname "$0")"
echo "Working in: $(pwd)"

# 1. Clear any stale git locks
rm -f .git/index.lock
rm -rf .git/rebase-merge .git/rebase-apply

# 2. Confirm we're on main and ahead of origin
echo ""
echo "=== status ==="
git status --short | head -20
echo ""
echo "=== ahead/behind ==="
git log --oneline origin/main..HEAD || true

# 3. Stage everything
git add -A

# 4. Commit (two logical commits for cleaner history)
# First commit: site-wide canonical shell + new providers/evidence sections
git commit -m "Apply canonical redesign shell site-wide (crisis-bar, skip-link, nav, footer__grid, footer__transparency)

- All 87 static-tools/*.html navigators now share the same canonical shell.
- All top-level pages (index, learn, resources, about, blog, contact, donors,
  data-reports, coc-finder, privacy) get crisis-bar, skip-link, and the
  civic-transparency footer block.
- All 13 help/[category]/ pages get the canonical shell + Related-guides
  linkbacks to relevant /blog/ articles where applicable.
- All 9 blog/ articles get the canonical shell.
- Nav updated to playbook 5-item taxonomy: Find help / Resources / For providers
  / Learn / About + Find-help-now CTA + Leave-page quick-exit.

Also bundled:
- Renamed nonprofits.html -> providers.html (with case-manager-guide anchor).
  nonprofits.html becomes a meta-refresh stub to /providers.html.
- New /learn/evidence/ section index — surfaces the two evidence briefs
  (federal-spending-rebuttal, high-performing-coc) under Learn.
- Retired root /maricopa-navigator.html — overwritten as meta-refresh stub
  pointing at /static-tools/maricopa-navigator.html (no inbound links, was
  orphan from pre-static-tools/ migration).
- Sitemap updated: added /help/, 12 help/[category]/, /providers.html,
  /learn/evidence/; renamed /nonprofits.html -> /providers.html; dropped
  /blog.html (now retired as primary destination). 114 unique URLs, deduped,
  XML valid.

Validation: every non-stub HTML page now has all 5 canonical shell elements;
zero conflict markers in repo; zero in-body /blog.html refs; sitemap.xml
passes xmllint."

# 5. Push
echo ""
echo "=== pushing ==="
git push origin main

echo ""
echo "=== done ==="
git log --oneline -5
echo ""
echo "Live site updates in ~60 seconds: https://www.commonladder.org"
