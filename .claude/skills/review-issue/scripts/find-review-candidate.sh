#!/usr/bin/env bash
# Print the lowest-numbered open dev PR that is eligible for first-pass review.
#
# Eligible = either:
#   - labeled `needs review`, or
#   - labeled `changes requested` AND at least one commit has been pushed to
#     the PR head after the `changes requested` label was applied (i.e., the
#     author has responded to feedback and the PR is ready for re-review).
#
# Skips PRs labeled `first pass reviewed` or `approved` — those belong to the
# final-review cron or are already done.
#
# Exits 0 with the PR number on stdout when a candidate is found.
# Exits 1 silently when nothing is ready.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

repo="normalled/apijack"

# One API call: list candidate PRs with labels + head SHA.
prs=$(gh pr list --repo "$repo" \
        --state open --base dev \
        --json number,labels,headRefOid \
        --jq 'map({
            number,
            labels: [.labels[].name],
            head:   .headRefOid
        }) | sort_by(.number) | .[]')

found=""
while read -r pr_json; do
    [ -z "$pr_json" ] && continue
    n=$(jq -r '.number' <<<"$pr_json")
    labels=$(jq -r '.labels[]' <<<"$pr_json")
    head=$(jq -r '.head' <<<"$pr_json")

    # `needs review` is unconditionally eligible.
    if grep -qxF "needs review" <<<"$labels"; then
        found="$n"
        break
    fi

    # `changes requested` is eligible only when a commit lands after the label.
    if ! grep -qxF "changes requested" <<<"$labels"; then
        continue
    fi
    labeled_at=$(gh api "repos/$repo/issues/$n/events" \
        --jq 'map(select(.event == "labeled" and .label.name == "changes requested"))
              | sort_by(.created_at) | reverse | .[0].created_at // empty')
    [ -z "$labeled_at" ] && continue

    head_at=$(gh api "repos/$repo/commits/$head" --jq '.commit.committer.date // empty')
    [ -z "$head_at" ] && continue

    labeled_ts=$(date -u -d "$labeled_at" +%s)
    head_ts=$(date -u -d "$head_at" +%s)
    if [ "$head_ts" -gt "$labeled_ts" ]; then
        found="$n"
        break
    fi
done < <(jq -c '.' <<<"$prs" 2>/dev/null || echo "$prs")

[ -n "$found" ] || exit 1
echo "$found"
