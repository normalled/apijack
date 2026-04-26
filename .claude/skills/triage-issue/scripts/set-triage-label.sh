#!/usr/bin/env bash
# Set an issue's triage-state label, removing any of the other triage-state labels.
#
# Mirrors review-issue/scripts/set-review-label.sh — uses the REST API directly
# because `gh issue edit --add-label` / `--remove-label` currently fail with
#   GraphQL: Projects (classic) is being deprecated ... (repository.pullRequest.projectCards)
#
# Usage: set-triage-label.sh <issue-number> <label>
#   <label> must be one of: needs triage | needs clarification | ready-for-implement
#
# Other (non-triage-state) labels on the issue are left untouched. The
# quarantine labels `edited-during-triage` and `injection-suspected` are
# additive and managed separately — they are NOT in the mutually-exclusive set.

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "usage: $0 <issue-number> <label>" >&2
    exit 2
fi

issue="$1"
target="$2"

state_labels=(
    "needs triage"
    "needs clarification"
    "ready-for-implement"
)

valid=0
for l in "${state_labels[@]}"; do
    if [ "$l" = "$target" ]; then
        valid=1
        break
    fi
done
if [ "$valid" -ne 1 ]; then
    echo "error: '$target' is not a known triage-state label" >&2
    echo "       expected one of: ${state_labels[*]}" >&2
    exit 2
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

current=$(gh api "repos/$repo/issues/$issue/labels" --jq '.[].name')

for l in "${state_labels[@]}"; do
    if [ "$l" = "$target" ]; then continue; fi
    if ! grep -qxF "$l" <<<"$current"; then continue; fi
    encoded=$(jq -rn --arg s "$l" '$s|@uri')
    gh api -X DELETE "repos/$repo/issues/$issue/labels/$encoded" >/dev/null
done

if ! grep -qxF "$target" <<<"$current"; then
    gh api -X POST "repos/$repo/issues/$issue/labels" -f "labels[]=$target" >/dev/null
fi

echo "issue #$issue labels:"
gh api "repos/$repo/issues/$issue/labels" --jq '.[].name' | sed 's/^/  - /'
