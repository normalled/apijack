#!/usr/bin/env bash
# Wait for the publish.yml workflow run on `next` matching a given commit SHA.
#
# Polls `gh run list` until a run for <commit-sha> appears (handles the race
# where the workflow hasn't registered yet), then `gh run watch --exit-status`.
# On non-zero exit, dumps `gh run view --log-failed` and propagates the code.
#
# Usage: wait-for-publish-next.sh <commit-sha>

set -euo pipefail

commit_sha="${1:?commit sha required}"
repo="normalled/apijack"

# Poll until the workflow run for our commit shows up.
run_id=""
attempts=0
max_attempts=30   # ~5 minutes at 10s intervals
while [ -z "$run_id" ] && [ "$attempts" -lt "$max_attempts" ]; do
    run_id=$(gh run list --repo "$repo" \
        --workflow publish.yml \
        --branch next \
        --commit "$commit_sha" \
        --limit 1 \
        --json databaseId \
        --jq '.[0].databaseId // empty')
    [ -n "$run_id" ] && break
    attempts=$((attempts + 1))
    sleep 10
done

if [ -z "$run_id" ]; then
    echo "No publish.yml run found for $commit_sha after $((max_attempts * 10))s" >&2
    exit 1
fi

echo "Watching publish.yml run $run_id for $commit_sha"

rc=0
gh run watch "$run_id" --repo "$repo" --exit-status || rc=$?
if [ "$rc" -ne 0 ]; then
    echo "publish.yml run $run_id failed (exit $rc); dumping failed logs:" >&2
    gh run view "$run_id" --repo "$repo" --log-failed >&2 || true
    exit "$rc"
fi
