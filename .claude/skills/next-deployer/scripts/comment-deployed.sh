#!/usr/bin/env bash
# Comment the @next install instructions on an issue and label it.
#
# Writes the install-instructions markdown to a tempfile and posts it via
# `gh issue comment --body-file` (avoiding the inline-`--body` backtick-escape
# footgun). Then applies the `deployed to next` label.
#
# Usage: comment-deployed.sh <issue-number> <next-version>
#   Example: comment-deployed.sh 65 1.10.2-next.3

set -euo pipefail

issue="${1:?issue number required}"
next_version="${2:?next version required}"
repo="normalled/apijack"

body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT

cat >"$body_file" <<EOF
Fix deployed to \`next\`. Install the exact version:

\`\`\`bash
bun install -g @apijack/core@$next_version
\`\`\`
EOF

gh issue comment "$issue" --repo "$repo" --body-file "$body_file"
gh issue edit "$issue" --repo "$repo" --add-label "deployed to next"
