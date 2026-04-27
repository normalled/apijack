#!/usr/bin/env bash
# Copy the smoke-test routine fixture into ~/.apijack/routines/ so the
# installed apijack CLI can find it. With --run, also execute the routine.
#
# Usage: seed-smoke-routine.sh [--run]

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="$script_dir/smoke-test.yaml"
dest_dir="$HOME/.apijack/routines"
dest="$dest_dir/smoke-test.yaml"

mkdir -p "$dest_dir"
cp "$fixture" "$dest"
echo "seeded $dest"

if [[ "${1:-}" == "--run" ]]; then
    apijack routine run smoke-test
fi
