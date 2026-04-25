#!/usr/bin/env bash
# Post a PR review with the body read from a file.
#
# Why this exists: when an LLM agent constructs `gh pr review --body "..."`
# inline, the model frequently inserts backslashes before backticks (a
# habit from training data where backticks need escaping in shell). The
# escapes then get posted literally and the rendered review is full of
# `\`code\`` artifacts. This script takes the body as a file path so the
# markdown never touches a shell-arg context.
#
# Usage: post-review.sh <pr-number> <comment|request-changes> <body-file>

set -euo pipefail

if [ $# -ne 3 ]; then
    echo "usage: $0 <pr-number> <comment|request-changes> <body-file>" >&2
    exit 2
fi

pr="$1"
decision="$2"
body="$3"

case "$decision" in
    comment)         flag="--comment" ;;
    request-changes) flag="--request-changes" ;;
    *) echo "decision must be 'comment' or 'request-changes' (got: $decision)" >&2; exit 2 ;;
esac

# Confine the body file to the scoped review-bodies directory. This keeps the
# Write capability (allowed in the cron yaml so the agent can produce this
# file) from being abusable into reading arbitrary repo paths via this script.
# Reject `..` first — bash case-pattern `*` matches `/` and `..`, so a path
# like `.claude-jobs/review-bodies/../README.md` would otherwise pass the
# prefix check.
case "$body" in
    *..*) echo "body file path must not contain '..' (got: $body)" >&2; exit 2 ;;
    .claude-jobs/review-bodies/*) ;;
    *) echo "body file must live under .claude-jobs/review-bodies/ (got: $body)" >&2; exit 2 ;;
esac

if [ ! -f "$body" ]; then
    echo "body file not found: $body" >&2
    exit 2
fi

if [ ! -s "$body" ]; then
    echo "body file is empty: $body" >&2
    exit 2
fi

gh pr review "$pr" "$flag" --body-file "$body"
