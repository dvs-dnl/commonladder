#!/bin/bash
# One-shot push script for any commonladder pending changes.
# Re-runnable: stages everything, commits with a default message, pushes.

set -e
cd "$(dirname "$0")"
echo "Working in: $(pwd)"

# 1. Clear stale locks
rm -f .git/index.lock
rm -rf .git/rebase-merge .git/rebase-apply

# 2. Status
echo ""
echo "=== status ==="
git --no-pager status --short | head -30
echo ""
echo "=== ahead/behind ==="
git --no-pager log --oneline origin/main..HEAD || true

# 3. Stage + commit
git add -A
if git diff --cached --quiet; then
  echo "Nothing staged. Skipping commit."
else
  MSG="${COMMIT_MSG:-Auto-update $(date +%Y-%m-%d)}"
  git commit -m "$MSG"
fi

# 4. Push
echo ""
echo "=== pushing ==="
git push origin main

echo ""
echo "=== done ==="
git --no-pager log --oneline -5
echo ""
echo "Live: https://www.commonladder.org"
