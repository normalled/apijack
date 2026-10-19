#!/usr/bin/env bash
# Fake `gh` for the review-issue script tests (tests/find-review-candidate.test.ts,
# tests/set-review-label.test.ts). It answers only the calls those scripts make,
# from a JSON fixture, and fails loudly on anything else, so a script change that
# issues a new call shape can't pass against a silently-wrong answer.
#
# Environment:
#   GH_FIXTURE   JSON state (built by tests/fixtures/fake-gh-review.ts). Label
#                writes update it in place, including the issue events they
#                produce on GitHub.
#   GH_CALL_LOG  every invocation is appended here, one line per call.
#
# Calls understood:
#   gh auth token --user <name>                              (gh-pin-account.sh)
#   gh repo view --json nameWithOwner -q <expr>
#   gh pr list --repo <r> --state open --base dev [--label <name>] --json <fields> --jq <expr>
#   gh pr view <n> --repo <r> --json headRefOid --jq <expr>
#   gh api [--paginate] repos/<r>/issues/<n>/events[?per_page=<k>] --jq <expr>
#       Like GitHub: oldest first, 30 a page unless per_page says otherwise,
#       and only the first page unless --paginate is passed.
#   gh api repos/<r>/commits/<sha> --jq <expr>
#   gh api repos/<r>/commits/<sha>/check-runs[?<query>] --jq <expr>
#       Fails with HTTP 502 for SHAs listed in the fixture's failingCheckRuns.
#   gh api repos/<r>/issues/<n>/labels --jq <expr>
#   gh api -X DELETE repos/<r>/issues/<n>/labels/<url-encoded-name>
#   gh api -X POST repos/<r>/issues/<n>/labels -f 'labels[]=<name>'
#       The first failLabelPosts POSTs (a fixture counter) fail with HTTP 502.

set -euo pipefail

fixture="${GH_FIXTURE:?GH_FIXTURE not set}"
log="${GH_CALL_LOG:?GH_CALL_LOG not set}"

printf '%s\n' "$*" >> "$log"

jqexpr=""
method="GET"
paginate=0
label_filter=""
fields=()
words=()
while [ $# -gt 0 ]; do
    case "$1" in
        --jq|-q) jqexpr="$2"; shift 2 ;;
        -X) method="$2"; shift 2 ;;
        -f) fields+=("$2"); shift 2 ;;
        --label) label_filter="$2"; shift 2 ;;
        --repo|--state|--base|--json|--user) shift 2 ;;
        --paginate) paginate=1; shift ;;
        -*) echo "fake gh: unexpected flag: $1" >&2; exit 2 ;;
        *) words+=("$1"); shift ;;
    esac
done

# Like gh: --jq string results print raw, anything else as compact JSON.
emit() {
    if [ -n "$jqexpr" ]; then
        jq -rc "$jqexpr"
    else
        cat
    fi
}

update_fixture() {
    local tmp
    tmp=$(mktemp)
    jq "$@" "$fixture" > "$tmp"
    mv "$tmp" "$fixture"
}

now() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

case "${words[0]:-} ${words[1]:-}" in
    "auth token")
        # No token for the pinned account: gh-pin-account.sh leaves GH_TOKEN alone.
        exit 1
        ;;
    "repo view")
        jq -c '{nameWithOwner: .repo}' "$fixture" | emit
        exit 0
        ;;
    "pr list")
        jq -c --arg l "$label_filter" \
            '[.prs[] | select($l == "" or any(.labels[]; .name == $l))]' "$fixture" | emit
        exit 0
        ;;
    "pr view")
        if ! jq -e --argjson n "${words[2]}" 'any(.prs[]; .number == $n)' "$fixture" > /dev/null; then
            echo "no pull requests found for branch \"${words[2]}\"" >&2
            exit 1
        fi
        jq -c --argjson n "${words[2]}" '.prs[] | select(.number == $n)' "$fixture" | emit
        exit 0
        ;;
    "api "*)
        ;;
    *)
        echo "fake gh: unrecognized call: ${words[*]}" >&2
        exit 2
        ;;
esac

path="${words[1]%%\?*}"
per_page=30
if [[ "${words[1]}" =~ [?\&]per_page=([0-9]+) ]]; then
    per_page="${BASH_REMATCH[1]}"
fi

if [[ "$method" == GET && "$path" =~ ^repos/[^/]+/[^/]+/issues/([0-9]+)/events$ ]]; then
    events=$(jq -c --arg n "${BASH_REMATCH[1]}" '.events[$n] // []' "$fixture")
    total=$(jq 'length' <<<"$events")
    pages=1
    if [ "$paginate" -eq 1 ] && [ "$total" -gt "$per_page" ]; then
        pages=$(( (total + per_page - 1) / per_page ))
    fi
    # Like gh --paginate, --jq runs once per page, not over all pages at once.
    for (( page = 0; page < pages; page++ )); do
        jq -c --argjson s $(( page * per_page )) --argjson k "$per_page" '.[$s:$s + $k]' <<<"$events" | emit
    done
elif [[ "$method" == GET && "$path" =~ ^repos/[^/]+/[^/]+/commits/([^/]+)/check-runs$ ]]; then
    if jq -e --arg s "${BASH_REMATCH[1]}" '(.failingCheckRuns // []) | index($s) != null' "$fixture" > /dev/null; then
        echo "gh: Server Error (HTTP 502)" >&2
        exit 1
    fi
    jq -c --arg s "${BASH_REMATCH[1]}" \
        '(.checkRuns[$s] // []) | {total_count: length, check_runs: .}' "$fixture" | emit
elif [[ "$method" == GET && "$path" =~ ^repos/[^/]+/[^/]+/commits/([^/]+)$ ]]; then
    sha="${BASH_REMATCH[1]}"
    if ! jq -e --arg s "$sha" '.commits | has($s)' "$fixture" > /dev/null; then
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
    fi
    jq -c --arg s "$sha" '.commits[$s]' "$fixture" | emit
elif [[ "$method" == GET && "$path" =~ ^repos/[^/]+/[^/]+/issues/([0-9]+)/labels$ ]]; then
    jq -c --argjson n "${BASH_REMATCH[1]}" \
        '[.prs[] | select(.number == $n) | .labels[]]' "$fixture" | emit
elif [[ "$method" == DELETE && "$path" =~ ^repos/[^/]+/[^/]+/issues/([0-9]+)/labels/(.+)$ ]]; then
    n="${BASH_REMATCH[1]}"
    encoded="${BASH_REMATCH[2]}"
    name=$(printf '%b' "${encoded//%/\\x}")
    if ! jq -e --argjson n "$n" --arg l "$name" \
        'any(.prs[] | select(.number == $n) | .labels[]; .name == $l)' "$fixture" > /dev/null; then
        echo "gh: Label does not exist (HTTP 404)" >&2
        exit 1
    fi
    update_fixture --argjson n "$n" --arg l "$name" --arg at "$(now)" '
        .prs |= map(if .number == $n then .labels |= map(select(.name != $l)) else . end)
        | .events[($n | tostring)] += [{event: "unlabeled", created_at: $at,
            actor: {login: "garretpremo"}, label: {name: $l, color: "ededed"}}]'
elif [[ "$method" == POST && "$path" =~ ^repos/[^/]+/[^/]+/issues/([0-9]+)/labels$ ]]; then
    n="${BASH_REMATCH[1]}"
    if [ "$(jq '.failLabelPosts // 0' "$fixture")" -gt 0 ]; then
        update_fixture '.failLabelPosts -= 1'
        echo "gh: Server Error (HTTP 502)" >&2
        exit 1
    fi
    for field in "${fields[@]}"; do
        name="${field#'labels[]='}"
        # GitHub treats adding a label that is already on the issue as a no-op:
        # no change, and no new `labeled` event.
        update_fixture --argjson n "$n" --arg l "$name" --arg at "$(now)" '
            if any(.prs[] | select(.number == $n) | .labels[]; .name == $l) then .
            else
                .prs |= map(if .number == $n
                    then .labels += [{id: ("LA_" + $l), name: $l, description: "", color: "ededed"}]
                    else . end)
                | .events[($n | tostring)] += [{event: "labeled", created_at: $at,
                    actor: {login: "garretpremo"}, label: {name: $l, color: "ededed"}}]
            end'
    done
else
    echo "fake gh: unrecognized api call: $method $path" >&2
    exit 2
fi
