#!/usr/bin/env bash
# Print how many check runs on a PR's head commit have not completed yet.
#
# 0 means nothing is pending: every check run has completed, whatever its
# conclusion (failed, skipped and cancelled included), or the head has no check
# runs at all, which path-filtered workflows legitimately produce.
#
# The review cron's candidate query (find-review-candidate.sh) and the
# review-issue skill's cron-mode CI check both use this, so the two can't
# disagree about whether CI is still running.
#
# Usage: pending-checks.sh <pr-number>

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [ $# -ne 1 ]; then
    echo "usage: $0 <pr-number>" >&2
    exit 2
fi

pr="$1"
repo="normalled/apijack"

head=$(gh pr view "$pr" --repo "$repo" --json headRefOid --jq '.headRefOid')

# --jq runs once per page under --paginate, so emit a line per pending run and
# count them here.
count=$(gh api --paginate "repos/$repo/commits/$head/check-runs?per_page=100" \
    --jq '.check_runs[] | select(.status != "completed") | .id' | wc -l)
echo $(( count ))
