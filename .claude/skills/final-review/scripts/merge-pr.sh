#!/usr/bin/env bash
# Merge a PR with SHA-pinned safety.
#
# GitHub will return 409 if the PR head has moved past $head_sha since the
# caller observed it — that's the desired TOCTOU guard. Treat any non-zero
# exit as "stop, do not retry": the final-review skill posts one comment
# quoting the error and moves the label to `needs review` (step 5), so the
# PR goes back through first-pass review instead of being re-selected.
#
# Usage: merge-pr.sh <pr> <head_sha> [merge_method]
#   merge_method: merge (default), squash, rebase

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

pr="${1:?pr number required}"
head_sha="${2:?head sha required}"
merge_method="${3:-merge}"
repo="normalled/apijack"

gh api -X PUT "repos/$repo/pulls/$pr/merge" \
    -f sha="$head_sha" \
    -f merge_method="$merge_method" \
    -F delete_branch=true
