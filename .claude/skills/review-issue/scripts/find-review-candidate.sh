#!/usr/bin/env bash
# Print the lowest-numbered open dev PR that is eligible for first-pass review.
#
# Eligible = either:
#   - labeled `needs review`, or
#   - labeled `changes requested` AND at least one commit has been pushed to
#     the PR head after the `changes requested` label was applied (i.e., the
#     author has responded to feedback and the PR is ready for re-review), or
#   - labeled `review in progress` AND the label was applied more than
#     stale-after seconds ago (the run that applied it died without posting a
#     verdict). Taken back at most once per head commit, so a review that dies
#     every time isn't retried forever; a new commit or a reset to
#     `needs review` re-arms it.
#
# ...and every check run on the PR's head commit has completed (see
# pending-checks.sh). A pending PR is deferred, not dropped: the script moves
# on to the next PR, and the deferred one qualifies on the first tick after its
# checks finish. A review can't pass without green CI, so a run started
# earlier could only wait out its timeout.
#
# Skips PRs labeled `first pass reviewed` or `approved` — those belong to the
# final-review cron or are already done.
#
# Exits 0 with the PR number on stdout when a candidate is found.
# Exits 1 when nothing is ready. Deferred and capped PRs are noted on stderr.
#
# Usage: find-review-candidate.sh [stale-after-seconds]
#   Defaults to 1800 (30 minutes): the review-issue job's 25-minute `timeout`
#   plus 5 minutes. The cron's overlap lock already keeps a live review-issue
#   run from being taken back; the threshold protects interactive
#   `/review-issue` sessions, so keep it above the job's `timeout`.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

stale_after="${1:-1800}"
if ! [[ "$stale_after" =~ ^[0-9]+$ ]]; then
    echo "usage: $0 [stale-after-seconds]" >&2
    exit 2
fi

repo="normalled/apijack"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
now=$(date -u +%s)

# Every `labeled` event on PR $1 as "<created_at><TAB><label>", oldest first.
# Paginated: the events API returns oldest first, so a long-lived PR's recent
# label events aren't on the first page. --jq runs once per page, so emit one
# line per event and aggregate afterwards.
labeled_events() {
    gh api --paginate "repos/$repo/issues/$1/events?per_page=100" \
        --jq '.[] | select(.event == "labeled") | "\(.created_at)\t\(.label.name)"'
}

# Timestamps of label $2 in labeled_events output $1, oldest first.
label_times() {
    awk -F '\t' -v label="$2" '$2 == label { print $1 }' <<<"$1" | sort
}

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
    taken_back_from=""

    if grep -qxF "needs review" <<<"$labels"; then
        # `needs review` is eligible as soon as its checks settle.
        :
    elif grep -qxF "changes requested" <<<"$labels"; then
        # `changes requested` is eligible only when a commit lands after the label.
        events=$(labeled_events "$n")
        labeled_at=$(label_times "$events" "changes requested" | tail -n 1)
        [ -z "$labeled_at" ] && continue

        head_at=$(gh api "repos/$repo/commits/$head" --jq '.commit.committer.date // empty')
        [ -z "$head_at" ] && continue

        labeled_ts=$(date -u -d "$labeled_at" +%s)
        head_ts=$(date -u -d "$head_at" +%s)
        [ "$head_ts" -gt "$labeled_ts" ] || continue
    elif grep -qxF "review in progress" <<<"$labels"; then
        # `review in progress` is eligible once stale (see the header). Every
        # review attempt leaves a `labeled` event (set-review-label.sh re-applies
        # this label even when it's present), so attempts are counted from the
        # events after the head commit or the last reset to `needs review`,
        # whichever is later.
        events=$(labeled_events "$n")
        attempts_at=$(label_times "$events" "review in progress")
        [ -z "$attempts_at" ] && continue

        labeled_at=$(tail -n 1 <<<"$attempts_at")
        labeled_ts=$(date -u -d "$labeled_at" +%s)
        [ $(( now - labeled_ts )) -lt "$stale_after" ] && continue

        head_at=$(gh api "repos/$repo/commits/$head" --jq '.commit.committer.date // empty')
        [ -z "$head_at" ] && continue

        since_ts=$(date -u -d "$head_at" +%s)
        reset_at=$(label_times "$events" "needs review" | tail -n 1)
        if [ -n "$reset_at" ]; then
            reset_ts=$(date -u -d "$reset_at" +%s)
            if [ "$reset_ts" -gt "$since_ts" ]; then
                since_ts="$reset_ts"
            fi
        fi

        attempts=0
        while read -r at; do
            if [ "$(date -u -d "$at" +%s)" -gt "$since_ts" ]; then
                attempts=$(( attempts + 1 ))
            fi
        done <<<"$attempts_at"
        if [ "$attempts" -ge 2 ]; then
            echo "PR #$n: 'review in progress' stalled again after a take-back on ${head:0:7};" \
                "not retrying until a new commit or a reset to 'needs review'" >&2
            continue
        fi
        taken_back_from="$labeled_at"
    else
        continue
    fi

    pending=$("$script_dir/pending-checks.sh" "$n")
    if [ "$pending" -gt 0 ]; then
        echo "PR #$n: deferred, $pending check run(s) still pending" >&2
        continue
    fi

    if [ -n "$taken_back_from" ]; then
        echo "PR #$n: taking back 'review in progress' left by a dead run (applied $taken_back_from)" >&2
    fi

    found="$n"
    break
done < <(jq -c '.' <<<"$prs" 2>/dev/null || echo "$prs")

[ -n "$found" ] || exit 1
echo "$found"
