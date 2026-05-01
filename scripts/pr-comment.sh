#!/usr/bin/env bash
# Post a comment on a PR or issue, always via --body-file.
#
# Why this exists: when an LLM agent constructs `gh pr comment --body "..."`
# inline, the model frequently inserts backslashes before backticks (a habit
# from training data where backticks need escaping in shell). The escapes
# then get posted literally and the rendered comment is full of `\`code\``
# artifacts. This wrapper enforces the --body-file path so the markdown never
# touches a shell-arg context.
#
# Usage: pr-comment.sh <pr-or-issue-number> <body-string-or-path> [--target=pr|issue]
#
#   <body-string-or-path>: if it's a path to an existing file, the file is
#       passed directly to gh via --body-file. Otherwise the value is treated
#       as a markdown string, written to a tempfile, and removed on exit.
#   --target: 'pr' (default) routes to `gh pr comment`; 'issue' routes to
#       `gh issue comment`.
#
# Prints the resulting comment URL on stdout.

set -euo pipefail

source "$(git rev-parse --show-toplevel)/scripts/gh-pin-account.sh"

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
    echo "usage: $0 <pr-or-issue-number> <body-string-or-path> [--target=pr|issue]" >&2
    exit 2
fi

number="$1"
body_arg="$2"
target="pr"

if [ $# -eq 3 ]; then
    case "$3" in
        --target=pr)    target="pr" ;;
        --target=issue) target="issue" ;;
        *) echo "invalid target flag: $3 (expected --target=pr or --target=issue)" >&2; exit 2 ;;
    esac
fi

if [ -f "$body_arg" ]; then
    body_file="$body_arg"
else
    body_file=$(mktemp)
    trap 'rm -f "$body_file"' EXIT
    printf '%s' "$body_arg" > "$body_file"
fi

case "$target" in
    pr)    gh pr comment "$number" --body-file "$body_file" ;;
    issue) gh issue comment "$number" --body-file "$body_file" ;;
esac
