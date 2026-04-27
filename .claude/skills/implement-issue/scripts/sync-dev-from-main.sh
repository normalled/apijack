#!/usr/bin/env bash
# Bring release commits from main back into dev. Idempotent.
#
# Usage: sync-dev-from-main.sh
#
# Steps: checkout dev, pull, merge origin/main, push. Aborts on conflicts with a
# clear message. Exits 0 if dev is already up to date with origin/main (no push).

set -euo pipefail

git fetch origin

git checkout dev
git pull --ff-only origin dev

# Already up to date? origin/main is an ancestor of dev — nothing to merge or push.
if git merge-base --is-ancestor origin/main HEAD; then
    echo "dev is already up to date with origin/main — nothing to do."
    exit 0
fi

if ! git merge --no-edit origin/main; then
    echo "Merge conflict while bringing origin/main into dev." >&2
    echo "Resolve manually, then re-run this script (or finish the merge and push)." >&2
    git merge --abort 2>/dev/null || true
    exit 1
fi

git push origin dev
echo "dev synced with origin/main and pushed."
