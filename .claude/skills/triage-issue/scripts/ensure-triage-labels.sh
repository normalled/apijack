#!/usr/bin/env bash
# Ensure the triage-workflow labels exist on the repo. Idempotent.

set -euo pipefail

ensure() {
    local name="$1" color="$2" desc="$3"
    if gh label list --json name --jq '.[].name' | grep -qxF "$name"; then
        return 0
    fi
    gh label create "$name" --color "$color" --description "$desc"
}

ensure "needs triage"          "C5DEF5" "Awaiting triage"
ensure "needs clarification"   "FBCA04" "Triage paused — author input required"
ensure "ready-for-implement"   "0E8A16" "Triage complete — eligible for the implement-issue workflow"
ensure "edited-during-triage"  "B60205" "Issue body or comments changed while triage was running — manual review needed"
ensure "injection-suspected"   "B60205" "Triage agent flagged possible prompt-injection content — quarantined"
