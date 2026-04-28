#!/usr/bin/env bash
# Tear down the petstore smoke-test environment.
#
# Kills the server on port 3459, removes the temp clone, and clears the
# session/routine artifacts written during the run. Idempotent — survives
# missing files and a server that is already gone.
#
# Usage: teardown-petstore.sh

set -euo pipefail

pids="$(lsof -ti:3459 2>/dev/null || true)"
if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
fi

rm -rf /tmp/apijack-petstore-test
rm -f "$HOME/.apijack/session.json"
rm -f "$HOME/.apijack/routines/smoke-test.yaml"
