#!/usr/bin/env bash
# gh-pin-account.sh — source from other scripts in this repo to pin `gh`
# authentication to the repo owner's account. Cron-driven skills otherwise
# fire under whichever gh account happens to be active, which has produced
# wrong-author posts in the past.
#
# Pin target is hardcoded — there is intentionally NO env-var override.
# An agent that finds itself locally authenticated as a second identity
# (e.g. a personal bot) MUST NOT use it to circumvent GitHub's "you cannot
# approve your own PR" rule by impersonating; that's a real-identity
# action posted under a different real human-or-bot persona, not an
# automation detail.
#
# Behavior:
#   - If a token for the pinned user is available locally → set GH_TOKEN
#     to that token (overrides any pre-existing GH_TOKEN).
#   - If no token is available for the pinned user → leave GH_TOKEN
#     untouched, so non-owner checkouts of this repo keep working under
#     whatever credentials they already have. The consumer script then
#     proceeds under the active account; this is acceptable because the
#     fallback identity is whatever the human running the script chose,
#     not a second identity an agent silently swapped to.
#   - If GH_PIN_USER is set in the environment → exit non-zero with a
#     diagnostic. The override does not exist.
#
# Usage from any consumer script in this repo:
#   source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [ -n "${GH_PIN_USER:-}" ]; then
    echo "gh-pin-account.sh: GH_PIN_USER override is not supported." >&2
    echo "  The pinned account is hardcoded; the override existed historically as" >&2
    echo "  a testing escape hatch and was removed because agents used it to" >&2
    echo "  impersonate a second identity to bypass GitHub's self-approval rule." >&2
    return 1 2>/dev/null || exit 1
fi

__gh_pin_user="garretpremo"
__gh_pin_token="$(gh auth token --user "$__gh_pin_user" 2>/dev/null || true)"
if [ -n "$__gh_pin_token" ]; then
    export GH_TOKEN="$__gh_pin_token"
fi
unset __gh_pin_user __gh_pin_token
