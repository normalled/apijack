---
name: test-next-release
description: Smoke-test the @next npm release against the petstore example — installs globally, sets up session auth, and verifies all CRUD operations work end-to-end
---

# Test @next Release

End-to-end smoke test for the `@apijack/core@next` npm package against the Petstore example API with session + CSRF auth.

Infrastructure (install / clone / wait / seed / teardown) is delegated to scripts under `scripts/`. The CRUD one-liners in steps 6–8 stay inline because they *are* the test.

## Prerequisites

- Bun installed
- Port 3459 available

## Steps

Run these steps in order. Script paths are relative to this skill's directory (`.claude/skills/test-next-release/`).

### 1. Install the latest @next release

```bash
./scripts/install-next.sh
```

Records the installed version on stdout. Report it before continuing.

### 2. Clone and start the Petstore API

```bash
./scripts/setup-petstore.sh
```

Clones into `/tmp/apijack-petstore-test`, starts the server in the background, and blocks until `localhost:3459/v3/api-docs` responds.

### 3. Configure apijack

Run setup to connect to the Petstore API. Use environment name `petstore`, URL `http://localhost:3459`, username `admin`, password `password`:

```bash
apijack setup
```

Or use the MCP setup tool if available.

### 4. Configure session auth

Add `sessionAuth` to the active environment config. The config file is at `~/.apijack/config.json` (or `.apijack/config.json` if in project mode). Merge `sessionAuth` into the active environment:

```json
{
  "sessionAuth": {
    "session": { "endpoint": "/session", "method": "GET" },
    "cookies": { "extract": ["SESSION", "XSRF-TOKEN"], "applyTo": ["*"] },
    "headerMirror": [
      { "fromCookie": "XSRF-TOKEN", "toHeader": "X-XSRF-TOKEN", "applyTo": ["POST", "PUT", "DELETE"] }
    ],
    "refreshOn": [401]
  }
}
```

### 5. Generate the CLI

```bash
apijack generate
```

Expected: "Generated files written to ..."

### 6. Test read operations (GET — session cookie only)

```bash
apijack pets list
apijack pets get 1
apijack pets list --species cat
apijack owners list
apijack owners get 1
```

All should return valid JSON. `pets list` should return 5 seed pets. `owners get 1` should include a `pets` array.

### 7. Test write operations (POST/PUT/DELETE — session cookie + XSRF)

```bash
apijack pets create-pet --name "SmokeTest" --species bird --age 2
```

Expected: 201 with `id: 6`, `name: "SmokeTest"`.

```bash
apijack pets update 6 --name "SmokeTestUpdated"
```

Expected: 200 with updated name.

```bash
apijack pets delete 6
```

Expected: 200 with deleted pet.

### 8. Test curl output (verify headers)

```bash
apijack pets create-pet --name "CurlTest" --species fish --age 1 -o curl
```

Verify the output includes:
- `-H 'Cookie: SESSION=...; XSRF-TOKEN=...'`
- `-H 'X-XSRF-TOKEN: ...'`

This confirms session auth and CSRF headers are being sent correctly.

### 9. Test routine execution

```bash
./scripts/seed-smoke-routine.sh --run
```

Copies the bundled `scripts/smoke-test.yaml` into `~/.apijack/routines/` and runs it. Expected: routine completes successfully with 3 steps run, 0 failed.

(Drop `--run` to seed without executing.)

### 10. Report results

Summarize:
- Installed version
- GET operations: pass/fail
- POST/PUT/DELETE operations: pass/fail
- Curl headers verified: pass/fail
- Routine execution: pass/fail

### 11. Clean up

```bash
./scripts/teardown-petstore.sh
```

Kills the server on port 3459, removes the temp clone, and deletes `~/.apijack/session.json` and `~/.apijack/routines/smoke-test.yaml`. Idempotent.

Optionally remove the global install:

```bash
bun remove -g @apijack/core
```
