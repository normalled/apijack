#!/usr/bin/env bash
# Fast-forward the rolling `next` branch from `dev` and push.
#
# Aborts non-zero on any non-fast-forward situation rather than force-pushing.
# After a successful push, returns the working tree to `dev`.
#
# Usage: ff-next-from-dev.sh
#   No arguments. Operates on the current repository's `dev` and `next`
#   branches against `origin`.

set -euo pipefail

git fetch origin

git checkout dev
git pull origin dev

git fetch origin next

# Ensure a local `next` exists tracking origin/next.
git checkout next 2>/dev/null || git checkout -b next origin/next

# Fail loudly on non-FF; do not force-push.
git merge --ff-only origin/dev

git push origin next

git checkout dev
