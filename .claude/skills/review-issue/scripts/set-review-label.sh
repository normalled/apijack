#!/usr/bin/env bash
# Set a PR's review-state label, removing any of the other review-state labels.
#
# `gh pr edit --add-label` / `--remove-label` currently fail with:
#   GraphQL: Projects (classic) is being deprecated ... (repository.pullRequest.projectCards)
# This bypasses that by using the REST API directly.
#
# Usage: set-review-label.sh [--reapply] <pr-number> <label>
#   <label> must be one of: needs review | review in progress | first pass reviewed | changes requested | approved
#   --reapply: if the PR already has <label>, remove and re-add it so GitHub
#     records a fresh `labeled` event (adding a label that's present is a no-op
#     there). Without it, a label that's already present is left alone.
#
# Other (non-review) labels on the PR are left untouched.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

reapply=0
if [ "${1:-}" = "--reapply" ]; then
    reapply=1
    shift
fi

if [ $# -ne 2 ]; then
    echo "usage: $0 [--reapply] <pr-number> <label>" >&2
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

if [ "$reapply" -eq 1 ] && grep -qxF "$target" <<<"$current"; then
    encoded=$(jq -rn --arg s "$target" '$s|@uri')
    gh api -X DELETE "repos/$repo/issues/$pr/labels/$encoded" >/dev/null
    current=$(grep -vxF "$target" <<<"$current" || true)
fi

# Add the target before removing the other review-state labels, so a failure
# never leaves the PR with none (which neither cron would pick up). Retried
# once, because under --reapply the label was just removed and a lost POST
# would leave none.
if ! grep -qxF "$target" <<<"$current"; then
    gh api -X POST "repos/$repo/issues/$pr/labels" -f "labels[]=$target" >/dev/null \
        || gh api -X POST "repos/$repo/issues/$pr/labels" -f "labels[]=$target" >/dev/null
fi

for l in "${review_labels[@]}"; do
    if [ "$l" = "$target" ]; then continue; fi
    if ! grep -qxF "$l" <<<"$current"; then continue; fi
    encoded=$(jq -rn --arg s "$l" '$s|@uri')
    gh api -X DELETE "repos/$repo/issues/$pr/labels/$encoded" >/dev/null
done

echo "PR #$pr labels:"
gh api "repos/$repo/issues/$pr/labels" --jq '.[].name' | sed 's/^/  - /'
