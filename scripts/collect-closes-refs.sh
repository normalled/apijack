#!/usr/bin/env bash
# collect-closes-refs.sh
#
# Print deduped 'Closes #N' lines for every issue referenced by the issue PRs
# merged in the current release range. Used by ship-release and patch-deployer
# to forward-port closing keywords from per-issue PR bodies into the release PR
# body — without these lines, GitHub never auto-closes the issues when the
# release PR merges into main.
#
# Reads from /tmp/apijack-ship-commits.txt by default (the file produced by
# gather-release-commits.sh), or from $1 if provided.
#
# Output: one 'Closes #N' line per unique issue, sorted ascending. Empty if
# no closing references were found.

set -euo pipefail

COMMITS_FILE="${1:-/tmp/apijack-ship-commits.txt}"

if [ ! -f "$COMMITS_FILE" ]; then
    echo "Commits file not found: $COMMITS_FILE" >&2
    exit 1
fi

# Extract every #NN reference from commit subjects. This catches both merge
# commits ('Merge pull request #74 ...') and squash subjects ('chore: foo (#74)').
# Issue numbers that show up will fail `gh pr view` and be skipped silently.
PR_NUMS=$(grep -oE '#[0-9]+' "$COMMITS_FILE" | sed 's/#//' | sort -un)

declare -A SEEN
for pr in $PR_NUMS; do
    BODY=$(gh pr view "$pr" --json body --jq '.body' 2>/dev/null) || continue
    [ -z "$BODY" ] && continue
    while IFS= read -r num; do
        [ -z "$num" ] && continue
        SEEN["$num"]=1
    done < <(echo "$BODY" | grep -ioE '(Closes|Fixes|Resolves)[[:space:]]+#[0-9]+' | grep -oE '[0-9]+' || true)
done

for num in "${!SEEN[@]}"; do
    echo "Closes #$num"
done | sort -V
