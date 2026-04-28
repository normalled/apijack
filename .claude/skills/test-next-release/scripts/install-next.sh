#!/usr/bin/env bash
# Install (or reinstall) the @apijack/core@next global build.
#
# Idempotent: silently ignores the remove failure when nothing was installed.
# Prints the resolved version on success so the caller can record it.
#
# Usage: install-next.sh

set -euo pipefail

bun remove -g @apijack/core 2>/dev/null || true
bun add -g @apijack/core@next
apijack --version
