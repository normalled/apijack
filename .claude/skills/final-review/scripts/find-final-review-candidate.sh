#!/usr/bin/env bash
# Find one open PR ready for final review.
#
# A PR is "ready" when:
#   - it is open, not a draft (GitHub won't merge one), and base is `dev`
#   - it has the `first pass reviewed` label
#   - the `first pass reviewed` label was applied >= MIN_AGE_SECONDS ago
#     (default 240 = 4 minutes)
#   - no commits have landed on the head since the label was applied
#     (otherwise the first-pass review is stale, and the review-issue cron
#     re-reviews the PR)
#   - every check run on the head commit has completed, whatever its
#     conclusion (see review-issue's pending-checks.sh). A pending PR is
#     deferred, not dropped: the script moves on to the next PR. Red CI stays
#     eligible so final-review's gate can report it.
#
# Prints the PR number on stdout and exits 0 when a candidate is found.
# Exits 1 when nothing is ready. Deferred PRs are noted on stderr.
#
# Usage: find-final-review-candidate.sh [min-age-seconds]

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source "$repo_root/scripts/gh-pin-account.sh"

min_age="${1:-240}"
repo="normalled/apijack"
threshold=$(( $(date -u +%s) - min_age ))

prs=$(gh pr list --repo "$repo" \
        --state open \
        --base dev \
        --label "first pass reviewed" \
        --json number,isDraft \
        --jq '.[] | select(.isDraft | not) | .number')

for pr in $prs; do
    # Paginated: events come oldest first, so a long-lived PR's latest label
    # isn't on the first page. --jq runs once per page, so pick the latest
    # after the pipe.
    labeled_at=$(gh api --paginate "repos/$repo/issues/$pr/events?per_page=100" \
        --jq '.[] | select(.event == "labeled" and .label.name == "first pass reviewed") | .created_at' \
        | sort | tail -n 1)
    [ -z "$labeled_at" ] && continue

    labeled_ts=$(date -u -d "$labeled_at" +%s)
    [ "$labeled_ts" -gt "$threshold" ] && continue   # too recent

    head_sha=$(gh pr view "$pr" --repo "$repo" --json headRefOid --jq '.headRefOid')
    head_at=$(gh api "repos/$repo/commits/$head_sha" --jq '.commit.committer.date')
    head_ts=$(date -u -d "$head_at" +%s)
    [ "$head_ts" -gt "$labeled_ts" ] && continue     # commits after label = stale

    pending=$("$repo_root/.claude/skills/review-issue/scripts/pending-checks.sh" "$pr")
    if [ "$pending" -gt 0 ]; then
        echo "PR #$pr: deferred, $pending check run(s) still pending" >&2
        continue
    fi

    echo "$pr"
    exit 0
done

exit 1
