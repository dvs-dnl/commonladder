#!/usr/bin/env bash
# One-time: wire scripts/ as the git hooks path for this clone, so the
# version-controlled scripts/pre-push runs before every push (including pushes
# made by the All Project Updater orchestrator, which uses real `git push`).
#
# Idempotent — safe to run multiple times.
#
# This supersedes the older approach of writing a hook into .git/hooks/. When
# core.hooksPath is set, git uses scripts/pre-push and ignores .git/hooks/pre-push.
# The new scripts/pre-push still runs the conflict-marker check, so nothing is lost.

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current="$(git config --local core.hooksPath || echo '')"
if [ "$current" = "scripts/" ] || [ "$current" = "scripts" ]; then
  echo "✓ core.hooksPath already set to scripts/ — nothing to do."
else
  git config --local core.hooksPath scripts/
  echo "✓ Wired core.hooksPath → scripts/"
fi
echo "  Pre-push will now run scripts/check-conflicts.sh + scripts/gate-check.py."
echo "  Bypass for one-off pushes with: git push --no-verify"
