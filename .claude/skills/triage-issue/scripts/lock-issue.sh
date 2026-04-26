#!/usr/bin/env bash
# Lock an issue's conversation to repo collaborators (no-op if already locked).
#
# CAVEAT: GitHub does NOT prevent the issue author from editing the body or
# title after lock. Locking only prevents non-collaborators from posting new
# comments. Pair with snapshot-issue.sh to detect post-lock edits.
#
# Usage: lock-issue.sh <issue-number>

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "usage: $0 <issue-number>" >&2
    exit 2
fi

issue="$1"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

locked=$(gh api "repos/$repo/issues/$issue" --jq '.locked')
if [ "$locked" = "true" ]; then
    echo "issue #$issue already locked"
    exit 0
fi

gh api -X PUT "repos/$repo/issues/$issue/lock" -f "lock_reason=resolved" >/dev/null
echo "issue #$issue locked (reason: resolved)"
