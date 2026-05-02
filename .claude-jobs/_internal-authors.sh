#!/usr/bin/env bash
# Single source of truth for the maintainer allowlist used by triage cron jobs.
#
# Sourced by:
#   - .claude-jobs/triage-internal.yaml  (preflight + prompt_cmd)
#   - .claude-jobs/triage-public.yaml    (preflight + prompt_cmd)
#
# Why a sourced snippet rather than per-block constants:
#   The harness runs `preflight.run` and `claude.prompt_cmd` in separate shells
#   with no shared environment. Duplicating the allowlist across both blocks
#   (in two yamls) made drift between the gates likely as the list grows —
#   silently changing which issues each gate accepts. Centralizing here keeps
#   the four call sites in lockstep.
#
# Exports:
#   INTERNAL_AUTHORS    — bash array of GitHub login names (used by triage-internal)
#   INTERNAL_AUTHORS_RE — anchored regex alternation matching the same set
#                         (used by triage-public's `jq test(...)` call)

INTERNAL_AUTHORS=("garretpremo")

# Build "^(a|b|c)$" from the array. Safe to regenerate on every source.
INTERNAL_AUTHORS_RE="^($(IFS='|'; echo "${INTERNAL_AUTHORS[*]}"))$"

export INTERNAL_AUTHORS INTERNAL_AUTHORS_RE
