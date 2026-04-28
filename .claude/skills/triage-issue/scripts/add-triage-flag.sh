#!/usr/bin/env bash
# Add an additive triage-flag label to an issue (does not touch state labels).
#
# Usage: add-triage-flag.sh <issue-number> <flag>
#   <flag> must be one of: edited-during-triage | injection-suspected

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [ $# -ne 2 ]; then
    echo "usage: $0 <issue-number> <flag>" >&2
    exit 2
fi

issue="$1"
flag="$2"

flags=(
    "edited-during-triage"
    "injection-suspected"
)

valid=0
for l in "${flags[@]}"; do
    if [ "$l" = "$flag" ]; then
        valid=1
        break
    fi
done
if [ "$valid" -ne 1 ]; then
    echo "error: '$flag' is not a known triage flag" >&2
    echo "       expected one of: ${flags[*]}" >&2
    exit 2
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api -X POST "repos/$repo/issues/$issue/labels" -f "labels[]=$flag" >/dev/null
echo "added '$flag' to issue #$issue"
