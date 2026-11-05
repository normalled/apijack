# apijack

apijack is a framework for generating full-featured CLIs from OpenAPI specs. It produces typed API clients, Commander-based command trees, and supports AI-agentic workflow automation via routines.

## Quick Start

```ts
import { createCli } from "@apijack/core";

const cli = createCli({
  name: "mycli",
  description: "My API CLI",
  version: "1.0.0",
  specPath: "/v3/api-docs",
  auth: new BasicAuthStrategy(),
});

await cli.run();
```

## Code Generation

Run `<cli> generate` against a live API to produce:

- `src/generated/types.ts` -- TypeScript interfaces from OpenAPI component schemas
- `src/generated/client.ts` -- API client class with one method per operationId
- `src/generated/commands.ts` -- Commander subcommands grouped by OpenAPI tags
- `src/generated/command-map.ts` -- Lookup table mapping command paths to metadata

Generated files are committed to git so the CLI works without a live API.

## Routine System

Routines are YAML-based workflow definitions stored in `~/.<cli>/routines/`. They chain CLI commands with variables, conditionals, loops, assertions, and sub-routines.

### Routine YAML Format

```yaml
name: my-routine
description: Example workflow
variables:
  project_name: "default-value"
steps:
  - name: create-resource
    command: resources create
    args:
      --name: "$project_name"
    output: created

  - name: verify-resource
    command: resources get
    args:
      --id: "$created.id"
    assert:
      - path: "$.name"
        equals: "$project_name"

  - name: process-items
    forEach: "$created.items"
    steps:
      - name: handle-item
        command: items process
        args:
          --id: "$item.id"

  - name: conditional-step
    command: resources finalize
    args:
      --id: "$created.id"
    condition: "$created.status == 'ready'"
```

### Key Routine Features

- **Variables**: Define defaults in `variables:`, override at runtime with `--set key=value`
- **Output capture**: `output: alias` stores step result, referenced as `$alias.field`
- **Conditions**: `condition:` expressions skip steps when false
- **forEach loops**: Iterate over arrays from previous step output
- **Assertions**: `assert:` validates response fields with `equals`, `contains`, `matches`
- **Sub-routines**: `routine:` field runs another routine inline

### Routine Commands

```bash
<cli> routine list              # List available routines
<cli> routine list --tree       # Show full tree structure
<cli> routine run <name>        # Execute a routine
<cli> routine run <name> --set key=value  # Override variables
<cli> --config <env> routine run <name>   # Run against another configured environment
<cli> routine run <name> --dry-run        # Preview without executing
<cli> routine run <name> --json           # Emit RoutineResult as JSON to stdout
<cli> routine run <name> -s / --quiet     # Print only what the routine's commands print (failures still on stderr)
<cli> routine validate <name>   # Validate YAML structure
<cli> routine test <name>       # Run spec (test) file
<cli> routine dir               # Print the routines directory
<cli> routine init              # Install built-in routines
```

## Command Discovery with `-o routine-step`

Append `-o routine-step` to any CLI command to output its YAML step definition instead of executing it. This is the primary way to discover command signatures for building routines.

```bash
<cli> resources create --name test -o routine-step
```

Outputs:

```yaml
- name: create
  command: resources create
  args:
    --name: "test"
    # --description: "" # optional -- Resource description
    # --tags: "" # optional -- Comma-separated tags
```

## Authentication Strategies

apijack supports pluggable authentication:

- **BasicAuthStrategy** -- HTTP Basic auth (username + password)
- **BearerTokenStrategy** -- Bearer token in Authorization header
- **ApiKeyStrategy** -- API key in a custom header
- **Custom** -- Implement the `AuthStrategy` interface for session-based or OAuth flows

## Built-in Commands

| Command | Description |
|---------|-------------|
| `setup` / `login` | Interactive credential configuration |
| `config list` | List configured environments |
| `config switch <name>` | Switch active environment |
| `config clear-session [name] [--all]` | Delete the named, selected or active environment's cached session; `--all` deletes every environment's |
| `--config <name> <command>` | Run one command against another configured environment, without switching (goes before the command) |
| `generate` | Regenerate CLI from the selected (or active) environment's OpenAPI spec |
| `routine list` | List available routines |
| `routine run <name>` | Execute a routine |
| `routine validate <name>` | Validate routine YAML |
| `routine test <name>` | Run a routine's spec/test file |
| `routine dir` | Print the directory routine files are read from |
| `skills install` / `update` / `status` / `uninstall` | Manage the CLI's Claude Code skills (see Claude Code Skills) |
| `plugin` | (deprecated) Register the Claude Code plugin for the MCP server |

### Turning off built-in commands

A CLI can leave out the optional `mcp` and `plugin` commands:

```json
// .apijack/settings.json
{ "disableCommands": ["mcp"] }
```

A project with its own `bin/<cli>.ts` passes `createCli({ disableCommands: ['mcp'], /* ... */ })` instead.

- Turning off `mcp` also turns off `plugin`, which registers the MCP server with Claude Code.
- With `plugin` off (directly or through `mcp`), updates (`upgrade` and the startup update prompt) no longer re-run `plugin install`.
- A turned-off command isn't registered: it's missing from help, and running it is an unknown-command error.
- Only `mcp` and `plugin` can be turned off. Any other value is dropped with a warning.

### Running one command against another environment

A leading `--config <name>` runs a single invocation against any environment in `config.json`, without changing the active one:

```bash
<cli> --config staging admin matters delete 7
<cli> --config staging routine run cleanup --set matterId=2   # every step and sub-routine uses staging
```

- Uses that environment's URL, credentials, auth type, `sessionAuth` / `refreshOn` and its own session file. It wins over `<CLI>_URL` / `_USER` / `_PASS`.
- It goes before the command; `--config=<name>` works too. A `--config` after the command belongs to that command (e.g. a generated flag for an API field named `config`); a command without one rejects it with a hint to move it.
- An unknown name fails with the list of configured environments.
- `<cli> --config <name> mcp` passes the environment on to every CLI call the MCP server makes.
- Programmatic: `runRoutine(name, { config: '<name>' })`, or `createCli({ environment: '<name>', ... })` (a leading `--config` still wins).

## Claude Code Skills

`<cli> skills install` copies the CLI's Claude Code skills into `~/.claude/skills/` (or `$CLAUDE_CONFIG_DIR/skills/`) as personal skills, one directory per skill named `<cli>-<skill>`. `setup` offers to do it. After that, if the CLI's skills change, a one-line notice says to run `<cli> skills update`. It's shown at most once a day, only in an interactive terminal, and never with `--json`, `-o` or `--quiet`, or during `routine run`.

- apijack ships `write-routine` (routine authoring through CLI commands) for every CLI, plus `setup-api` for the bare `apijack` CLI.
- A CLI adds its own skills in `.apijack/skills/<name>/SKILL.md`, or passes `createCli({ skillsDir })` in a project with its own `bin/<cli>.ts`. On the shared binary, project skills need `name` set in `.apijack.json`; without it they're ignored with a warning.
- A CLI skill with a built-in's name replaces it. `"skills": { "builtin": false }` in `.apijack/settings.json` (or `createCli({ builtinSkills: false })`) drops the built-ins.
- `{{cli}}` in a skill's `.md` files becomes the CLI's name when installed.
- On the shared binary, that name is `.apijack.json` `name`, so set it to the command your users actually type. It also prefixes the installed skill directories.
- `install`, `update` and `uninstall` only touch directories this CLI installed, which carry a `.apijack-skill.json` marker. `install --force` overwrites a directory it didn't install.

| Command | Description |
|---------|-------------|
| `skills install [names...] [--force]` | Install or refresh all skills, or only the named ones |
| `skills update` | Refresh changed skills, add ones the CLI started shipping, remove ones it stopped shipping |
| `skills status [--json]` | Each skill's status: `not installed`, `up to date`, `outdated`, `conflict` or `orphaned` |
| `skills uninstall` | Remove every skill this CLI installed |

`plugin` (the old Claude Code plugin, which registers the MCP server) is deprecated. It's left out of the bare command listing, marked `(deprecated)` in `--help`, and `plugin install` no longer copies skills.

## MCP Server

Run `<cli> mcp` to start a Model Context Protocol server, exposing all CLI commands as MCP tools for use with AI agents and editors.

A CLI can turn it off with `disableCommands` — see "Turning off built-in commands" above.

## Gemini Integration

This project follows the GEMINI.md convention. Key patterns:

- **GEMINI.md**: Place project context in GEMINI.md at the repository root
- **activate_skill**: Use the activate_skill directive to load specialized capabilities
- **Routine authoring**: Use `-o routine-step` to discover command signatures, then compose multi-step YAML routines
- **MCP integration**: Start the MCP server with `<cli> mcp` to expose commands as tools
