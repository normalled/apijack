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
comments_json=$(gh api --paginate "repos/$repo/issues/$issue/comments" \
    | jq -s 'add // [] | map({id, user: .user.login, body, updated_at})')

snapshot=$(jq -n \
    --argjson issue "$issue_json" \
    --argjson comments "$comments_json" \
    '{
        number:     $issue.number,
        title:      $issue.title,
        body:       $issue.body,
        author:     $issue.user.login,
        created_at: $issue.created_at,
        updated_at: $issue.updated_at,
        locked:     $issue.locked,
        comments:   $comments
    }')

printf '%s\n' "$snapshot" > "$out"

# Canonical hash: sort keys so re-serializations match.
printf '%s' "$snapshot" | jq -Sc . | sha256sum | awk '{print $1}'
