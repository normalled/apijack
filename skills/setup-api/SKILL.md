---
name: setup-api
description: Use when connecting apijack to an API — configuring environments, generating the CLI, and switching between configs
---

# Setting Up an API with apijack

Connect apijack to any API with an OpenAPI spec to generate a full CLI.

## Quick Setup

```bash
{{cli}} setup              # Interactive: URL + credentials (Basic auth by default)
{{cli}} generate           # Pull spec, generate types/client/commands
{{cli}} --help             # See generated commands
```

## Setup Details

`{{cli}} setup` prompts for:
- **Environment name** (e.g. "dev", "staging")
- **API base URL** (e.g. "http://localhost:8080")
- **Credentials** (username + password)

Auth is Basic by default and is **not** read from the OpenAPI spec's `securitySchemes`. To use another strategy, add a `.apijack/auth.ts` exporting an `AuthStrategy`, or set `authType` (`bearer` or `apiKey`, plus `authHeader` / `apiKey` for the latter) on the environment entry in `config.json`.

Credentials are stored in `~/.apijack/config.json` for dev URLs. Production URLs require environment variables:

```bash
export APIJACK_URL=https://api.example.com
export APIJACK_USER=user@example.com
export APIJACK_PASS=secret
```

`{{cli}} setup` is interactive (it reads the password without echoing it), so it needs a real terminal. Ask the user to run `{{cli}} setup` in their own terminal, or use the environment variables above.

## Multi-Environment

```bash
{{cli}} setup                    # Add another environment
{{cli}} config list              # Show all environments
{{cli}} config switch staging    # Switch active environment
{{cli}} config clear-session     # Log the active environment out (--all for every environment)
{{cli}} --config staging <cmd>   # Run one command against staging without switching
{{cli}} generate                 # Regenerate from new environment's spec
```

## What Generate Produces

`{{cli}} generate` creates four files from the OpenAPI spec:

| File | Contents |
|------|----------|
| `types.ts` | TypeScript interfaces from component schemas |
| `client.ts` | API client with one method per operationId |
| `commands.ts` | Commander subcommands grouped by tags |
| `command-map.ts` | Lookup table mapping command paths to metadata |

After generating, all API operations are available as CLI commands.

## Internal Networks

Allow credential storage for internal IPs by listing their ranges in the project's `.apijack.json`:

```json
{ "allowedCidrs": ["192.168.1.0/24", "10.0.0.0/8"] }
```

## Troubleshooting

- **"No environments configured"** — run `{{cli}} setup`
- **"Command map not available"** — run `{{cli}} generate` after setup
- **"Production API detected"** — use env vars or add the network to allowed CIDRs
- **Edited `config.json` by hand** — run `{{cli}} config clear-session` (or `{{cli}} config clear-session <env>` for another environment) so the next command logs in with the new credentials
- **Auth failures after setup** — try `{{cli}} config switch <env>` to verify active environment, `{{cli}} config clear-session` to force a fresh login, then `{{cli}} generate` to refresh
