#!/usr/bin/env bash
# Find one open PR ready for final review.
#
# A PR is "ready" when:
#   - it is open and base is `dev`
#   - it has the `first pass reviewed` label
#   - the `first pass reviewed` label was applied >= MIN_AGE_SECONDS ago
#     (default 240 = 4 minutes)
#   - no commits have landed on the head since the label was applied
#     (otherwise the first-pass review is stale)
#
# Prints the PR number on stdout and exits 0 when a candidate is found.
# Exits 1 when nothing is ready.
#
# Usage: find-final-review-candidate.sh [min-age-seconds]

set -euo pipefail

min_age="${1:-240}"
repo="normalled/apijack"
threshold=$(( $(date -u +%s) - min_age ))

prs=$(gh pr list --repo "$repo" \
        --state open \
        --base dev \
        --label "first pass reviewed" \
        --json number \
        --jq '.[].number')

for pr in $prs; do
    labeled_at=$(gh api "repos/$repo/issues/$pr/events" \
        --jq 'map(select(.event == "labeled" and .label.name == "first pass reviewed"))
              | sort_by(.created_at) | reverse | .[0].created_at // empty')
    [ -z "$labeled_at" ] && continue

    labeled_ts=$(date -u -d "$labeled_at" +%s)
    [ "$labeled_ts" -gt "$threshold" ] && continue   # too recent

    head_sha=$(gh pr view "$pr" --repo "$repo" --json headRefOid --jq '.headRefOid')
    head_at=$(gh api "repos/$repo/commits/$head_sha" --jq '.commit.committer.date')
    head_ts=$(date -u -d "$head_at" +%s)
    [ "$head_ts" -gt "$labeled_ts" ] && continue     # commits after label = stale

    echo "$pr"
    exit 0
done

exit 1
