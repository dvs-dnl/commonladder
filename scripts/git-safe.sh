#!/usr/bin/env bash
# =============================================================================
# git-safe.sh
#
# Wrapper for git operations that runs reliably inside the Claude sandbox's
# bindfs mount. The sandbox blocks unlink() on files inside .git/ (rename is
# allowed), so git's internal lockfile cleanup fails: index.lock and HEAD.lock
# get left behind, blocking every subsequent git invocation with:
#
#   fatal: Unable to create '.git/index.lock': File exists.
#
# This wrapper moves any pre-existing .lock files aside (mv works, rm does not)
# before each git call. The orphaned moved-aside files are zero-byte and
# harmless.
#
# Usage:
#   source scripts/git-safe.sh
#   git_safe status
#   git_safe add -A
#   git_safe commit -m "..."
#   git_safe push
#
# Or invoke directly:
#   bash scripts/git-safe.sh status
#   bash scripts/git-safe.sh add -A
# =============================================================================

git_safe_clear_locks() {
  # Move-aside any stale .lock files in .git/ that bindfs won't let us unlink.
  # Globs may not match anything; the [ -f ] guard handles that case.
  local f stamp
  stamp="$(date +%s%N)"
  for f in .git/index.lock \
           .git/HEAD.lock \
           .git/ORIG_HEAD.lock \
           .git/FETCH_HEAD.lock \
           .git/MERGE_HEAD.lock \
           .git/config.lock \
           .git/packed-refs.lock \
           .git/shallow.lock; do
    [ -f "$f" ] && mv "$f" "${f}.moved.${stamp}" 2>/dev/null
  done
  # Per-ref locks (refs/heads/*.lock, refs/remotes/*/.lock, refs/tags/*.lock)
  while IFS= read -r f; do
    [ -f "$f" ] && mv "$f" "${f}.moved.${stamp}" 2>/dev/null
  done < <(find .git/refs -name '*.lock' 2>/dev/null)
}

git_safe() {
  git_safe_clear_locks
  git "$@"
}

# If executed directly (not sourced), forward all args to git via git_safe.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  git_safe "$@"
  exit $?
fi
