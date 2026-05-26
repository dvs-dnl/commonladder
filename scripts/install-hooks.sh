#!/usr/bin/env bash
# =============================================================================
# install-hooks.sh
#
# Usage: bash scripts/install-hooks.sh
#
# Installs the pre-push git hook for this repository.
# Run this once after cloning the repo (or whenever you want to re-install).
#
# The hook prevents pushing files that contain unresolved merge conflict
# markers (<<<<<<< , =======, >>>>>>> ).
#
# This script is necessary because .git/hooks/ is a local directory that
# is NOT tracked by git — each developer must install hooks themselves.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
PRE_PUSH_HOOK="$HOOKS_DIR/pre-push"

# Verify we're in a git repo
if [ ! -d "$HOOKS_DIR" ]; then
  echo "ERROR: .git/hooks directory not found at: $HOOKS_DIR" >&2
  echo "Make sure you are running this from inside a git repository." >&2
  exit 1
fi

# Write the pre-push hook
cat > "$PRE_PUSH_HOOK" << 'HOOK'
#!/usr/bin/env bash
# =============================================================================
# pre-push hook — installed by scripts/install-hooks.sh
#
# Runs the conflict-marker check before every push.
# Aborts the push (exit 1) if any .html/.css/.js files contain unresolved
# git merge conflict markers.
#
# To bypass in an emergency (not recommended):
#   git push --no-verify
# =============================================================================

# Locate the repo root (two levels up from .git/hooks/)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$HOOK_DIR")")"
CHECK_SCRIPT="$REPO_ROOT/scripts/check-conflicts.sh"

# If the check script exists, delegate to it
if [ -f "$CHECK_SCRIPT" ]; then
  bash "$CHECK_SCRIPT" "$REPO_ROOT"
  STATUS=$?
else
  # Fallback: inline check in case the scripts/ directory is missing
  echo "WARNING: check-conflicts.sh not found at $CHECK_SCRIPT — running inline check." >&2
  OFFENDING=$(grep -rlE '^(<<<<<<< |=======|>>>>>>> )' \
    --include="*.html" --include="*.css" --include="*.js" \
    "$REPO_ROOT" 2>/dev/null)
  if [ -n "$OFFENDING" ]; then
    echo ""
    echo "ERROR: Unresolved merge conflict markers found. Push aborted."
    echo "$OFFENDING"
    echo ""
    STATUS=1
  else
    STATUS=0
  fi
fi

if [ $STATUS -ne 0 ]; then
  echo ""
  echo "Push aborted. Fix conflict markers and try again."
  echo "(To bypass this check in an emergency: git push --no-verify)"
  echo ""
  exit 1
fi

exit 0
HOOK

chmod +x "$PRE_PUSH_HOOK"

echo ""
echo "Git pre-push hook installed successfully at:"
echo "  $PRE_PUSH_HOOK"
echo ""
echo "The hook will now block pushes containing unresolved merge conflict markers"
echo "in .html, .css, and .js files."
echo ""
