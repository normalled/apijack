#!/usr/bin/env bash
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; }

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "dev" ]; then
    fail "Must be on the dev branch (currently on: $BRANCH)"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    fail "Working tree is dirty. Commit or stash changes first."
    exit 1
fi

# Ensure next branch exists locally
if ! git show-ref --verify --quiet refs/heads/next; then
    info "Creating next branch from main..."
    git branch next main
fi

info "Merging dev into next..."
git checkout next --quiet
git pull origin next --quiet 2>/dev/null || true
git merge dev --quiet
git push origin next --quiet
git checkout dev --quiet

ok "Pushed to next. Publish workflow will handle the rest."
