#!/usr/bin/env bash
# Pick the PR for this review-issue cron run and print its number. If the
# pick is a take-back (the PR is still `review in progress` from a run that
# died), claim it first: re-apply the label so the attempt is on record.
#
# find-review-candidate.sh caps take-backs by counting `labeled:
# review in progress` events, so a take-back run has to leave one whatever the
# agent does; the agent's own step-1.5 call is then a no-op. A first pick is
# left to the agent, which applies the label in step 1.5: if claude fails fast
# (usage limit, expired auth), the PR stays eligible as it was instead of
# being claimed, taken back and capped. If the claim fails, so does this
# script, and claude-cron doesn't start the run.
#
# Exits 1 without claiming anything when no PR is eligible.
#
# Usage: claim-review-candidate.sh [stale-after-seconds]
#   Passed through to find-review-candidate.sh.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

repo="normalled/apijack"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pr=$("$script_dir/find-review-candidate.sh" "$@")
labels=$(gh api "repos/$repo/issues/$pr/labels" --jq '.[].name')
if grep -qxF "review in progress" <<<"$labels"; then
    "$script_dir/set-review-label.sh" --reapply "$pr" "review in progress" >&2
fi
echo "$pr"
