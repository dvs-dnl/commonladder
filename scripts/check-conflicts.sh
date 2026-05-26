#!/usr/bin/env bash
# =============================================================================
# check-conflicts.sh
#
# Usage: bash scripts/check-conflicts.sh [repo-root]
#
# Scans .html, .css, and .js files for unresolved git merge conflict markers:
#   <<<<<<< (conflict start)
#   ======= (conflict divider)
#   >>>>>>> (conflict end)
#
# Exits 0 if no conflict markers are found (safe to push).
# Exits 1 if any conflict markers are found (push should be aborted).
#
# Optionally accepts a repo root path as the first argument.
# Defaults to the directory containing this script's parent (repo root).
# =============================================================================

# Resolve the repo root: use argument if given, otherwise derive from script location
if [ -n "$1" ]; then
  REPO_ROOT="$1"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(dirname "$SCRIPT_DIR")"
fi

# Confirm the repo root exists
if [ ! -d "$REPO_ROOT" ]; then
  echo "ERROR: Repo root not found: $REPO_ROOT" >&2
  exit 1
fi

# Regex pattern for merge conflict markers
CONFLICT_PATTERN='^(<<<<<<< |=======|>>>>>>> )'

# File types to scan
FILE_GLOBS=("*.html" "*.css" "*.js")

# Build the grep include arguments
INCLUDE_ARGS=()
for glob in "${FILE_GLOBS[@]}"; do
  INCLUDE_ARGS+=("--include=$glob")
done

# Run the search
OFFENDING_FILES=$(grep -rlE "$CONFLICT_PATTERN" "${INCLUDE_ARGS[@]}" "$REPO_ROOT" 2>/dev/null)

if [ -n "$OFFENDING_FILES" ]; then
  echo ""
  echo "ERROR: Unresolved merge conflict markers found in the following files:"
  echo "-----------------------------------------------------------------------"
  while IFS= read -r file; do
    # Print path relative to repo root for readability
    echo "  ${file#$REPO_ROOT/}"
  done <<< "$OFFENDING_FILES"
  echo "-----------------------------------------------------------------------"
  echo "Resolve all conflict markers before pushing."
  echo ""
  exit 1
fi

echo "check-conflicts: No conflict markers found. Clean to push."
exit 0
