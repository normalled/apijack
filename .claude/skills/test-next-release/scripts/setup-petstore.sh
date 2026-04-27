#!/usr/bin/env bash
# Clone the apijack-petstore-example, start it in the background, and wait
# until the OpenAPI doc is being served on localhost:3459.
#
# Exits 0 once the server responds. The background `bun run start` is left
# running for the caller; teardown-petstore.sh kills it.
#
# Usage: setup-petstore.sh

set -euo pipefail

target_dir="/tmp/apijack-petstore-test"
ready_url="http://localhost:3459/v3/api-docs"

rm -rf "$target_dir"
git clone https://github.com/normalled/apijack-petstore-example.git "$target_dir"

(cd "$target_dir" && bun run start) &

until curl -sf "$ready_url" > /dev/null 2>&1; do
    sleep 0.5
done

echo "petstore ready at $ready_url"
