#!/usr/bin/env bash
# Snapshot an issue's title, body, author, and comment IDs to a local file
# and emit a sha256 hash of the canonical content. Used to detect post-triage
# edits, since GitHub does not prevent issue authors from editing their own
# issues after submission.
#
# Usage: snapshot-issue.sh <issue-number>
#
# Writes:  .claude-jobs/triage-snapshots/<issue-number>.json
# Prints:  <sha256>  on stdout

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"
# shellcheck source=_canonical-fields.sh
source "$(dirname "$0")/_canonical-fields.sh"

if [ $# -ne 1 ]; then
    echo "usage: $0 <issue-number>" >&2
    exit 2
fi

issue="$1"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
out=".claude-jobs/triage-snapshots/${issue}.json"

mkdir -p "$(dirname "$out")"

# Pull canonical fields. Comments are paginated, so use --paginate.
issue_json=$(gh api "repos/$repo/issues/$issue")
comments_json=$(gh api --paginate "repos/$repo/issues/$issue/comments" | jq -s 'add // []')

snapshot=$(build_canonical_snapshot "$issue_json" "$comments_json")

printf '%s\n' "$snapshot" > "$out"

# Canonical hash: sort keys so re-serializations match.
printf '%s' "$snapshot" | jq -Sc . | sha256sum | awk '{print $1}'
