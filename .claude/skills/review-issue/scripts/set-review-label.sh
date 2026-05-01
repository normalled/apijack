#!/usr/bin/env bash
# Set a PR's review-state label, removing any of the other review-state labels.
#
# `gh pr edit --add-label` / `--remove-label` currently fail with:
#   GraphQL: Projects (classic) is being deprecated ... (repository.pullRequest.projectCards)
# This bypasses that by using the REST API directly.
#
# Usage: set-review-label.sh <pr-number> <label>
#   <label> must be one of: needs review | review in progress | first pass reviewed | changes requested | approved
#
# Other (non-review) labels on the PR are left untouched.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [ $# -ne 2 ]; then
    echo "usage: $0 <pr-number> <label>" >&2
    exit 2
fi

pr="$1"
target="$2"

review_labels=(
    "needs review"
    "review in progress"
    "first pass reviewed"
    "changes requested"
    "approved"
)

valid=0
for l in "${review_labels[@]}"; do
    if [ "$l" = "$target" ]; then
        valid=1
        break
    fi
done
if [ "$valid" -ne 1 ]; then
    echo "error: '$target' is not a known review-state label" >&2
    echo "       expected one of: ${review_labels[*]}" >&2
    exit 2
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

current=$(gh api "repos/$repo/issues/$pr/labels" --jq '.[].name')

for l in "${review_labels[@]}"; do
    if [ "$l" = "$target" ]; then continue; fi
    if ! grep -qxF "$l" <<<"$current"; then continue; fi
    encoded=$(jq -rn --arg s "$l" '$s|@uri')
    gh api -X DELETE "repos/$repo/issues/$pr/labels/$encoded" >/dev/null
done

if ! grep -qxF "$target" <<<"$current"; then
    gh api -X POST "repos/$repo/issues/$pr/labels" -f "labels[]=$target" >/dev/null
fi

echo "PR #$pr labels:"
gh api "repos/$repo/issues/$pr/labels" --jq '.[].name' | sed 's/^/  - /'
