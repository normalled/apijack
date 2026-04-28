#!/usr/bin/env bash
# Gather the commit log for a pending dev → main release.
#
# Verifies preflight (on dev, working tree clean), fetches origin, writes the
# `origin/main..HEAD` log to a stable temp file, and prints that path on
# stdout. Used by both the ship-release and patch-deployer skills.
#
# Usage: gather-release-commits.sh [--format=<git-format-string>]
#   --format    git log --pretty format string (default: "%h %s")

set -euo pipefail

FORMAT="%h %s"
OUT="/tmp/apijack-ship-commits.txt"

usage() {
    echo "Usage: gather-release-commits.sh [--format=<git-format-string>]" >&2
}

for arg in "$@"; do
    case "$arg" in
        --format=*)
            FORMAT="${arg#--format=}"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            usage
            exit 2
            ;;
    esac
done

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "dev" ]; then
    echo "Must be on the dev branch (currently on: $BRANCH)" >&2
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree is dirty. Commit or stash changes first." >&2
    exit 1
fi

git fetch origin --quiet

git log origin/main..HEAD --pretty=format:"$FORMAT" > "$OUT"

echo "$OUT"
