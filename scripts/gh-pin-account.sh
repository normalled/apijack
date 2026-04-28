#!/usr/bin/env bash
# gh-pin-account.sh — source from other scripts in this repo to pin `gh`
# authentication to a known account. Cron-driven skills otherwise fire under
# whichever account happens to be active, which leaves wrong-author reviews
# and comments on PRs (see the gpremo-re posts on PR #80 that motivated this).
#
# Falls back silently to the active account if the pinned user isn't
# configured locally — non-owner checkouts of this repo keep working under
# whatever credentials they have.
#
# Override the default user with GH_PIN_USER, e.g. for testing:
#   GH_PIN_USER=other-account some-script.sh
#
# Usage from any consumer script in this repo:
#   source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

__gh_pin_user="${GH_PIN_USER:-garretpremo}"
__gh_pin_token="$(gh auth token --user "$__gh_pin_user" 2>/dev/null || true)"
if [ -n "$__gh_pin_token" ]; then
    export GH_TOKEN="$__gh_pin_token"
fi
unset __gh_pin_user __gh_pin_token
