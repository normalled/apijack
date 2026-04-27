#!/usr/bin/env bash
# Create the issue branch (and optionally a sibling worktree) for implement-issue step 1.
#
# Usage: start-issue-branch.sh <issue-number> <short-slug> [--worktree]
#   With --worktree: creates a sibling worktree at ../apijack-<slug>.
#   Without:         checks out the new branch in the current repo.
#
# Always branches from origin/dev after a fetch. The worktree path is printed on
# stdout so callers can `cd` into it themselves.

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
    echo "Usage: $0 <issue-number> <short-slug> [--worktree]" >&2
    exit 1
fi

issue="$1"
slug="$2"
mode="${3:-}"

if [[ -n "$mode" && "$mode" != "--worktree" ]]; then
    echo "Unknown flag: $mode (expected --worktree)" >&2
    exit 1
fi

branch="issues/${issue}-${slug}"

git fetch origin

if [[ "$mode" == "--worktree" ]]; then
    worktree_path="../apijack-${slug}"
    git worktree add "$worktree_path" -b "$branch" origin/dev
    cd "$worktree_path"
    echo "Worktree ready: $(pwd)"
    echo "Branch: $branch"
else
    git checkout -b "$branch" origin/dev
    echo "Branch ready: $branch"
fi
