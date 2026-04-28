#!/usr/bin/env bash
# wait-for-review.sh <pr-number>
#
# Polls a GitHub PR every 60s until a NEW review arrives with one of:
#   - "first pass reviewed"   (accepted)
#   - "changes requested"     (blocking)
#
# On a new review, prints the verdict label and the latest review body, then exits 0.
#
# "New" is determined by comparing the latest review timestamp at script start
# to the latest review timestamp on each poll — so this is safe to re-run after
# pushing a fix to wait for the next review cycle.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <pr-number>" >&2
    exit 1
fi

PR=$1

# Validate PR exists up front
if ! gh pr view "$PR" --json number >/dev/null 2>&1; then
    echo "Error: cannot find PR #$PR (is it open and accessible via gh?)" >&2
    exit 1
fi

INITIAL_TS=$(gh pr view "$PR" --json reviews --jq '[.reviews[].submittedAt] | sort | last // ""')

echo "Watching PR #$PR for a new review."
echo "Starting latest-review timestamp: ${INITIAL_TS:-<none>}"
echo "Polling every 60s. Looking for label: 'first pass reviewed' OR 'changes requested'."
echo ""

while true; do
    STATE=$(gh pr view "$PR" --json reviews,labels 2>/dev/null || echo '{"reviews":[],"labels":[]}')

    LATEST_TS=$(echo "$STATE" | jq -r '[.reviews[].submittedAt] | sort | last // ""')
    HAS_TARGET=$(echo "$STATE" | jq -r '
        .labels | map(.name) | any(. == "first pass reviewed" or . == "changes requested")
    ')

    if [[ "$LATEST_TS" != "$INITIAL_TS" && "$HAS_TARGET" == "true" ]]; then
        VERDICT=$(echo "$STATE" | jq -r '
            .labels | map(.name)
            | if any(. == "changes requested") then "changes requested"
              elif any(. == "first pass reviewed") then "first pass reviewed"
              else "unknown" end
        ')
        ALL_LABELS=$(echo "$STATE" | jq -r '.labels | map(.name) | join(", ")')

        echo "=== Review received at $LATEST_TS ==="
        echo "Verdict label: $VERDICT"
        echo "All labels: $ALL_LABELS"
        echo ""
        echo "--- Latest review body ---"
        echo "$STATE" | jq -r '.reviews | sort_by(.submittedAt) | last | .body'
        exit 0
    fi

    sleep 60
done
