#!/usr/bin/env bash
# Shared canonical-fields template used by snapshot-issue.sh and verify-snapshot.sh.
#
# Both scripts must hash the SAME set of fields in the SAME order — otherwise
# verify-snapshot.sh starts reporting spurious "edited" results when the field
# lists drift apart. Source this file from both to keep the template in one
# place.
#
# Usage (after sourcing):
#   build_canonical_snapshot "$issue_json" "$comments_json"
#
# Inputs:
#   $1 — issue JSON (object) from `gh api repos/<repo>/issues/<n>`
#   $2 — comments JSON (array) from
#        `gh api --paginate repos/<repo>/issues/<n>/comments | jq -s 'add // []'`
#        (i.e. already flattened across pages, but NOT yet projected — this
#        function does the projection so the comment-field list lives here too)
#
# Output:
#   The canonical snapshot JSON is printed to stdout. Callers decide whether to
#   pretty-print it for storage (snapshot-issue.sh) or compact-and-hash it for
#   verification (verify-snapshot.sh).

build_canonical_snapshot() {
    local issue_json="$1"
    local comments_json="$2"
    local projected_comments
    projected_comments=$(jq 'map({id, user: .user.login, body, updated_at})' <<<"$comments_json")

    jq -n \
        --argjson issue "$issue_json" \
        --argjson comments "$projected_comments" \
        '{
            number:     $issue.number,
            title:      $issue.title,
            body:       $issue.body,
            author:     $issue.user.login,
            created_at: $issue.created_at,
            updated_at: $issue.updated_at,
            locked:     $issue.locked,
            comments:   $comments
        }'
}
