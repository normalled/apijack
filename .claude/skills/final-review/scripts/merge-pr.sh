#!/usr/bin/env bash
# Merge a PR with SHA-pinned safety.
#
# GitHub will return 409 if the PR head has moved past $head_sha since the
# caller observed it — that's the desired TOCTOU guard. Treat any non-zero
# exit as "stop, do not retry." The next cron tick will re-run the gates.
#
# Usage: merge-pr.sh <pr> <head_sha> [merge_method]
#   merge_method: merge (default), squash, rebase

set -euo pipefail

pr="${1:?pr number required}"
head_sha="${2:?head sha required}"
merge_method="${3:-merge}"
repo="normalled/apijack"

gh api -X PUT "repos/$repo/pulls/$pr/merge" \
    -f sha="$head_sha" \
    -f merge_method="$merge_method" \
    -F delete_branch=true
