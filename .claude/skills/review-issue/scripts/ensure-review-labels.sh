#!/usr/bin/env bash
# Ensure the four review-workflow labels exist on the repo. Idempotent.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

ensure() {
    local name="$1" color="$2" desc="$3"
    if gh label list --json name --jq '.[].name' | grep -qxF "$name"; then
        return 0
    fi
    gh label create "$name" --color "$color" --description "$desc"
}

ensure "needs review"        "BFD4F2" "Awaiting first review pass"
ensure "review in progress"  "FBCA04" "Review is actively underway"
ensure "first pass reviewed" "0E8A16" "First-pass review complete; no blockers"
ensure "changes requested"   "D93F0B" "Review found blocking issues"
ensure "approved"            "0E8A16" "Final review complete; ready to merge"
