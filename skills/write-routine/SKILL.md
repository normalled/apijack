---
name: write-routine
description: Use when building apijack YAML routines — workflow automations that chain CLI commands with variables, loops, conditions, and assertions
---

# Writing apijack Routines

Routines are YAML workflows that chain CLI commands. They live in `~/.<cli>/routines/` (or `.apijack/routines/` in project mode).

## IMPORTANT: Always Prefer Routines

**ALWAYS use routines** for multi-step workflows. Routines support variables, loops, randomization, and output capture — use `create_routine` + `run_routine` instead of multiple `run_commands` calls. Only fall back to `run_commands` when each call needs unique LLM-generated values that can't be expressed as variables or built-in functions.

## IMPORTANT: Use Loops, Not Hardcoded Steps

When a routine repeats an operation N times, **always use `range` or `forEach`** — never hardcode N individual steps. Use `shuffle: true` for random order and `reverse: true` for reverse order. Use built-in functions like `$_random_hex_color` instead of hardcoding values.

**Bad** (50 hardcoded steps):
```yaml
- name: create-01
  command: todos create
  args: { --title: "Todo 1" }
- name: create-02
  command: todos create
  args: { --title: "Todo 2" }
# ... 48 more
```

**Good** (1 loop):
```yaml
- name: create-todos
  range: [1, 50]
  as: n
  steps:
    - name: create
      command: todos create
      args:
        --title: "Todo $n"
```

## Discover Commands First

Use `get_routine_templates` to get YAML step templates for multiple commands at once:

```json
get_routine_templates({ commands: [
  { command: "todos create", args: { "--title": "example" } },
  { command: "todos patch", args: { "--id": "xxx", "--color": "#fff" } },
  { command: "todos delete" }
]})
```

This returns each command as a ready-to-use routine step with all available args shown. Use `describe_command` for the full argument schema (types, required/optional, descriptions).

## Routine Structure

```yaml
name: my-routine
description: What this routine does
variables:
  project_name: "default-value"
  run_id: "run-$_timestamp"
steps:
  - name: step-name
    command: resources create
    args:
      --name: "$project_name"
    output: created
```

### Built-in Variables and Functions

**Variables:**
- `$_timestamp` — Unix epoch seconds
- `$_date` — ISO date (YYYY-MM-DD)
- `$_uuid` — random UUID

**Randomization functions (evaluated fresh each time):**
- `$_random_hex_color` — random `#rrggbb` color
- `$_random_int(min,max)` — random integer in range
- `$_random_from(a,b,c)` — pick one randomly (may repeat)
- `$_random_distinct_from(a,b,c)` — pick one randomly, no repeats until all used (then cycles)

**Environment:**
- `$_env(VAR)` / `$_env(VAR, default)` — read from environment. `.env` at the project root is auto-loaded at startup; real env vars take precedence.

**Array lookup:**
- `$_find($array, field, value)` — return the first element of `$array` where `element[field] == value`, or `undefined` if nothing matches. The array arg and the value arg resolve `$refs`; the field is a literal name.
- `$_contains($array, field, value)` — returns `"true"` or `"false"`. Useful in conditions.

Example — skip creation when an entity already exists:
```yaml
- name: list-projects
  command: projects list
  output: projects

- name: create
  command: projects create
  args:
    --name: "$name"
  condition: "$_find($projects, name, $name) == undefined"
```

Variables can reference other variables in defaults: `run_id: "run-$_timestamp"`.

Override at runtime: `<cli> routine run my-routine --set project_name=prod`.

## Output Capture and References

`output: alias` stores a step's result. Reference fields with dot notation:

```yaml
- name: create-project
  command: projects create
  args:
    --name: "$project_name"
  output: project

- name: get-project
  command: projects get
  args:
    --id: "$project.id"
```

Step results are also available by step name: `$create-project.id`.

Use `$alias.success` to check if a step succeeded (boolean).

## Conditions

Skip steps when a condition is false:

```yaml
- name: finalize
  command: resources finalize
  args:
    --id: "$created.id"
  condition: "$created.status == ready"
```

Supported operators: `==`, `!=`, or bare `$ref` for truthy check. The RHS may be a literal, a `$ref`, or the keyword `undefined` (for strict `=== undefined` comparison — useful with `$_find`). Function calls like `$_find(...)` are allowed on the LHS.

## Loops

### forEach — iterate over arrays

```yaml
- name: process-items
  forEach: "$created.items"
  as: item          # default is "item" if omitted
  steps:
    - name: handle
      command: items process
      args:
        --id: "$item.id"
```

**Modifiers:**
- `shuffle: true` — randomize iteration order
- `reverse: true` — iterate in reverse order

```yaml
- name: color-randomly
  forEach: "$todos"
  shuffle: true
  as: todo
  steps:
    - name: update-color
      command: todos patch
      args:
        --id: "$todo.id"
        --color: "$_random_hex_color"

- name: delete-reversed
  forEach: "$todos"
  reverse: true
  as: todo
  steps:
    - name: delete
      command: todos delete
      args:
        --id: "$todo.id"
```

### range — iterate over numbers

```yaml
- name: create-pages
  range: [1, 5]
  as: page
  steps:
    - name: create-page
      command: pages create
      args:
        --number: "$page"
```

Range also supports `shuffle: true` and `reverse: true`.

## Assertions

Validate step output inline:

```yaml
- name: check-status
  command: resources get
  args:
    --id: "$created.id"
  assert: "$check-status.status == active"
```

Assertion failure stops the routine unless `continueOnError: true`.

## Error Handling

```yaml
- name: risky-step
  command: might-fail
  continueOnError: true
```

## Sub-Routines

Call another routine inline:

```yaml
- name: setup
  command: routine run
  args-positional:
    - setup/environment
```

## Meta-Commands

Built-in commands available in routines:

- **`wait-until`** — poll until truthy result
  ```yaml
  - name: wait-ready
    command: wait-until
    args-positional:
      - resources get
    args:
      --id: "$created.id"
      --timeout: "60"
      --interval: "5"
  ```

- **`session refresh`** — re-authenticate mid-routine
  ```yaml
  - name: refresh
    command: session refresh
  ```

## Routine Commands

```bash
<cli> routine run <name>                   # Execute
<cli> routine run <name> --set key=value   # Override variables
<cli> routine run <name> --dry-run         # Preview without executing
<cli> routine validate <name>              # Check YAML structure
<cli> routine test <name>                  # Run spec/test file
<cli> routine list                         # List available
<cli> routine list --tree                  # Show tree structure
```

## Custom Resolvers

If the built-in `$_*` functions aren't enough, add project-specific resolvers by dropping a `.ts` file into `.apijack/resolvers/`. They show up as `$_<name>(...)` inside routines, just like the built-ins.

**`.apijack/resolvers/uppercase.ts`:**
```ts
import type { CustomResolverHelpers } from '@apijack/core';

export const name = '_uppercase';

export default function uppercase(argsStr?: string, helpers?: CustomResolverHelpers): string {
    // helpers.resolve() expands $refs and built-in functions inside the arg
    const raw = argsStr ?? '';
    const resolved = helpers ? String(helpers.resolve(raw)) : raw;

    return resolved.toUpperCase();
}
```

**Use it in a routine:**
```yaml
variables:
  greeting: "hello-world"
steps:
  - name: create
    command: resources create
    args:
      --title: "$_uppercase($greeting)"   # → "HELLO-WORLD"
```

**Rules:**
- File name (or `export const name`) becomes the function name. It **must** start with `_` to match the `$_*` call syntax.
- Built-in names (`_env`, `_find`, `_uuid`, `_random_*`, etc.) are reserved — a colliding custom resolver is skipped with a stderr warning.
- `helpers.resolve(value)` runs the arg through the full resolver (same rules as a routine value), so `$refs`, `$_env(...)`, and other `$_*` functions inside the arg get expanded before your function sees them. Skip it to receive literal args (like `$_env` does).
- Resolvers are sync. Return the value directly.

## Project Extensions

The `.apijack/` directory at a project root is auto-loaded when the CLI runs inside that project. Drop a file in one of these subdirs and it's picked up:

| Directory | File exports | Used as |
|-----------|--------------|---------|
| `.apijack/resolvers/*.ts` | `default`: `(argsStr?, helpers?) => unknown`, optional `name` | Custom `$_*(...)` routine functions |
| `.apijack/commands/*.ts` | `default`: `(program, ctx) => void`, optional `name` | Extra CLI subcommands |
| `.apijack/dispatchers/*.ts` | `default`: `(args, posArgs, ctx) => Promise<unknown>`, optional `name` | Handle non-API commands invoked from routines |
| `.apijack/auth.ts` | `default`: `AuthStrategy`, optional `onChallenge` | Project-level auth strategy |
| `.apijack/routines/*.yaml` | Routine YAML | Available via `routine run <name>` |
| `.apijack/settings.json` | `{ customCommands: { defaults: { requiresAuth } } }` | Framework defaults for extensions |

### Opting custom commands into auth

Custom commands and dispatchers get `ctx.session = null` by default (only generated OpenAPI commands auto-resolve). To get a non-null session, add `export const requiresAuth = true` alongside the registrar:

```ts
// .apijack/commands/sync.ts
import type { CommandRegistrar } from "@apijack/core";

export const name = "sync";
export const requiresAuth = true;

const register: CommandRegistrar<true> = (program, ctx) => {
  program.command("sync").action(async () => {
    // ctx: AuthedCliContext — ctx.session is non-null, no casts needed
  });
};
export default register;
```

Dispatchers: same export, `DispatcherHandler<true>` for the typed form.

Flip the default for every extension in `.apijack/settings.json`:

```json
{ "customCommands": { "defaults": { "requiresAuth": true } } }
```

Module exports override the settings default. Two `ctx` helpers close out the picture:

- `ctx.resolveSession()` — resolve once without setting the module flag
- `ctx.saveSession()` — persist a mutated `ctx.session` without importing `SessionManager`

## Common Patterns

### Create-then-verify

```yaml
- name: create
  command: resources create
  args:
    --name: "$name"
  output: created

- name: verify
  command: resources get
  args:
    --id: "$created.id"
  assert: "$verify.name == $name"
```

### Poll until ready

```yaml
- name: wait
  command: wait-until
  args-positional:
    - jobs status
  args:
    --id: "$job.id"
    --timeout: "120"
```

### Idempotent create (skip if exists)

```yaml
- name: list-existing
  command: projects list
  output: projects

- name: create
  command: projects create
  args:
    --name: "$name"
  condition: "$_find($projects, name, $name) == undefined"
  output: created

- name: verify
  command: projects list
  output: final
  assert: "$_contains($final, name, $name) == true"
```

### Batch operations

```yaml
- name: process-all
  forEach: "$list.items"
  continueOnError: true
  steps:
    - name: process
      command: items update
      args:
        --id: "$item.id"
        --status: "processed"
```
