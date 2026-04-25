#!/usr/bin/env bash
# Verify the live issue still matches the snapshot taken at triage start.
# Returns 0 if unchanged, 1 if changed (and writes a diff summary to stderr).
#
# Usage: verify-snapshot.sh <issue-number> <expected-sha256>

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "usage: $0 <issue-number> <expected-sha256>" >&2
    exit 2
fi

issue="$1"
expected="$2"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

issue_json=$(gh api "repos/$repo/issues/$issue")
comments_json=$(gh api --paginate "repos/$repo/issues/$issue/comments" \
    | jq -s 'add // [] | map({id, user: .user.login, body, updated_at})')

actual=$(jq -nSc \
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
    }' | sha256sum | awk '{print $1}')

if [ "$actual" = "$expected" ]; then
    echo "snapshot verified for issue #$issue"
    exit 0
fi

echo "WARN: issue #$issue has changed since triage started" >&2
echo "  expected sha256: $expected" >&2
echo "  actual sha256:   $actual" >&2
exit 1
