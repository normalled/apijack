#!/usr/bin/env bash
# Label every issue referenced as `Closes #N` / `Fixes #N` / `Resolves #N`
# in the PR body with `merged to dev`. Intended to run AFTER the PR has
# been merged to dev — the label marks the issue as "shipped to dev,
# pending release to main" so downstream reporting can find it.
#
# Why parse the body ourselves instead of using GitHub's
# `closingIssuesReferences` GraphQL field: that field only surfaces
# references that will auto-close on merge to the DEFAULT branch (main).
# This repo's flow merges to dev first, so the API returns empty for
# the PRs we care about here.
#
# Idempotent: re-adding an existing label is a no-op for the GitHub API.
# Non-fatal: a missing issue or per-issue failure is logged and skipped;
# the overall script exits 0. The merge already succeeded; labeling is a
# best-effort marker.
#
# Usage: label-merged-issues.sh <pr>

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

pr="${1:?pr number required}"
repo="normalled/apijack"
label="merged to dev"

body=$(gh api "repos/$repo/pulls/$pr" --jq '.body // ""')

# Match GitHub's recognized closing keywords:
#   close / closes / closed
#   fix / fixes / fixed
#   resolve / resolves / resolved
# followed by whitespace, `#`, and a number. Case-insensitive on the keyword.
issues=$(printf '%s\n' "$body" \
    | grep -oiE '\b(close[sd]?|fix(es|ed)?|resolve[sd]?)[[:space:]]+#[0-9]+' \
    | grep -oE '[0-9]+' \
    | sort -un)

if [ -z "$issues" ]; then
    echo "label-merged-issues: no closing references in PR #$pr body; nothing to label."
    exit 0
fi

while IFS= read -r issue; do
    if gh api -X POST "repos/$repo/issues/$issue/labels" -f "labels[]=$label" >/dev/null 2>&1; then
        echo "  + labeled issue #$issue with '$label'"
    else
        echo "  ! failed to label issue #$issue (does it exist?)" >&2
    fi
done <<<"$issues"
