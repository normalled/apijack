#!/usr/bin/env bash
# Decide whether origin/dev is ready to ship as a patch release.
#
# Mirrors the bump-level logic in scripts/ship.sh:
#   - any commit body containing `BREAKING CHANGE` → major
#   - any commit subject starting with `feat`      → minor
#   - everything else                              → patch
#
# Exits 0 iff:
#   - origin/dev is ahead of origin/main by ≥ 1 commit, AND
#   - the cumulative bump level is exactly `patch` (no `feat:`, no `BREAKING CHANGE`)
#
# Prints the commit count on stdout so the caller can include it in the prompt.
# Exits 1 silently when the conditions are not met (caller treats as a no-op).
#
# Usage: find-patch-deploy-candidate.sh

set -euo pipefail

# Sanity: must be inside the apijack repo.
[ -f package.json ] || exit 1

# Refresh refs so origin/main and origin/dev reflect the remote.
git fetch origin --quiet 2>/dev/null || exit 1

# Both refs must exist.
git rev-parse --verify origin/main >/dev/null 2>&1 || exit 1
git rev-parse --verify origin/dev  >/dev/null 2>&1 || exit 1

ahead=$(git rev-list --count origin/main..origin/dev)
[ "$ahead" -gt 0 ] || exit 1

range="origin/main..origin/dev"
commit_text=$(git log "$range" --pretty=format:"%s%n%b")

# Major bumps are out of scope.
if grep -q "BREAKING CHANGE" <<<"$commit_text"; then
    exit 1
fi

# Minor bumps are out of scope — `feat:` or `feat(scope):` at start of any subject.
# Use a stricter regex than ship.sh's `^feat` to avoid false positives on words
# like `feature` or `featured` that don't follow the conventional-commits prefix.
if git log "$range" --pretty=format:"%s" | grep -qE "^feat(\(|:)"; then
    exit 1
fi

echo "$ahead"
