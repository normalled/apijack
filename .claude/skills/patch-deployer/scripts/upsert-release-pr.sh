#!/usr/bin/env bash
# Find-or-create the open dev → main release PR.
#
# If a PR with --head dev --base main is already open, edit its title/body.
# Otherwise push dev and create one. Either way, prints the PR number.
#
# Usage: upsert-release-pr.sh <title> <body-file>

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

title="${1:?title required}"
body_file="${2:?body file required}"
repo="normalled/apijack"

[ -f "$body_file" ] || { echo "body file not found: $body_file" >&2; exit 1; }

existing=$(gh pr list --repo "$repo" --head dev --base main --state open --json number --jq '.[0].number')

if [ -n "$existing" ]; then
    gh pr edit "$existing" --repo "$repo" --title "$title" --body-file "$body_file" >/dev/null
    echo "$existing"
else
    git push -u origin dev
    url=$(gh pr create --repo "$repo" --base main --head dev \
        --title "$title" --body-file "$body_file")
    echo "${url##*/}"
fi
