# AI Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI agent integration to apijack — package-level convention files, project-level generated docs, and an MCP server — so any AI coding agent can discover, understand, and operate CLIs built with the framework.

**Architecture:** Three layers: (1) static convention files shipped in the npm package, generated from a single template at prepack time; (2) project-level docs emitted by the `generate` command with append-mode markers; (3) an MCP server with tools-only for execution and introspection.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk` (optional dependency)

**Spec:** `docs/superpowers/specs/2026-03-27-ai-agent-integration-design.md`

**CRITICAL: No product-specific references in the apijack project.**

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/agent-docs/render.ts` | Template renderer — renders templates to convention files for all agent targets, handles append mode markers |
| `src/agent-docs/template.md` | Single-source template for package-level docs (conditionals for Claude/Gemini/generic) |
| `src/agent-docs/project-template.md` | Template for project-level generated docs (uses ProjectContext) |
| `src/mcp-server.ts` | MCP server — all tools, shells out to CLI for actions, reads disk for introspection |
| `scripts/prepack-agent-docs.ts` | Prepack script — renders package-level docs before npm publish |
| `CLAUDE.md` | Generated package-level Claude guidance (committed) |
| `AGENTS.md` | Generated package-level generic guidance (committed) |
| `GEMINI.md` | Generated package-level Gemini guidance (committed) |
| `skills/apijack/SKILL.md` | Generated package-level Claude Code skill (committed) |

**Modified files:**
| File | Changes |
|------|---------|
| `src/cli-builder.ts` | Register `mcp` subcommand, add `--no-agent-docs` / `--agent-docs` flags to `generate`, call `renderProjectDocs()` after codegen |
| `src/index.ts` | Export `renderProjectDocs` and `ProjectContext` type |
| `package.json` | Add `prepack` script, add `@modelcontextprotocol/sdk` to optionalDependencies |

---

### Task 1: Agent Docs Template + Renderer

**Files:**
- Create: `/home/gpremo-re/rational/apijack/src/agent-docs/render.ts`
- Create: `/home/gpremo-re/rational/apijack/src/agent-docs/template.md`
- Create: `/home/gpremo-re/rational/apijack/src/agent-docs/project-template.md`
- Test: `/home/gpremo-re/rational/apijack/tests/agent-docs/render.test.ts`

- [ ] **Step 1: Write failing tests for the renderer**

Write `tests/agent-docs/render.test.ts` covering:
- `renderPackageDocs(outDir)` creates `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and `skills/apijack/SKILL.md` in the output directory
- CLAUDE.md contains Claude-specific content (mentions CLAUDE.md convention, skills)
- GEMINI.md contains Gemini-specific content (mentions GEMINI.md, `activate_skill`)
- AGENTS.md contains generic content (no agent-specific features)
- All three contain core apijack content (createCli, generate, routines, auth strategies)
- `skills/apijack/SKILL.md` has correct frontmatter format
- `renderProjectDocs(projectContext, opts)` creates project-level files in opts.outDir
- Project docs include actual command inventory from ProjectContext
- Project docs include routine list from ProjectContext
- Append mode: existing content outside markers is preserved
- Append mode: content between markers is replaced
- Append mode: markers are added to end of file if they don't exist
- Overwrite mode: file is fully replaced
- `--no-agent-docs` skips generation entirely
- Cursor rules file created at `.cursor/rules/apijack.md`
- Project skill created at `.claude/skills/<cliName>/SKILL.md`

Use temp directories.

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/agent-docs/render.test.ts
```
Expected: FAIL

- [ ] **Step 2: Create the package-level template**

Write `src/agent-docs/template.md` — a markdown template with simple `{{#if agent_claude}}` / `{{#if agent_gemini}}` / `{{#if agent_generic}}` conditionals. Content covers:
- What apijack is
- Quick start with `createCli()`
- `generate` command workflow
- Routine YAML format (variables, conditions, forEach, assertions)
- `-o routine-step` discovery pattern
- Auth strategies (Basic, Bearer, API Key, Custom)
- Built-in commands (setup, config, generate, routine)
- MCP server availability
- Agent-specific sections (Claude: skills, CLAUDE.md convention; Gemini: GEMINI.md, activate_skill; Generic: CLI-only patterns)

- [ ] **Step 3: Create the project-level template**

Write `src/agent-docs/project-template.md` — uses `{{cliName}}`, `{{description}}`, `{{version}}`, `{{#each commands}}`, `{{#each routines}}` placeholders. Includes:
- CLI name and description
- Full command table (path, description, hasBody)
- Routine list with descriptions
- Example commands using actual CLI name
- Routine YAML example using actual command names

- [ ] **Step 4: Implement render.ts**

Write `src/agent-docs/render.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

export interface ProjectContext {
  cliName: string;
  description: string;
  version: string;
  commands: Array<{ path: string; operationId: string; description?: string; hasBody: boolean }>;
  routines: Array<{ name: string; description?: string }>;
  activeEnv?: { url: string; user: string };
}

interface RenderOpts {
  outDir: string;
  mode?: "append" | "overwrite";
}

export function renderPackageDocs(outDir: string): void { ... }
export function renderProjectDocs(ctx: ProjectContext, opts: RenderOpts): void { ... }
```

Key implementation details:
- Template rendering: simple `{{variable}}` replacement + `{{#if condition}}...{{/if}}` blocks + `{{#each items}}...{{/each}}` loops. No need for a template engine dependency — hand-roll a simple renderer.
- Append mode: read existing file, find `<!-- apijack:generated:start -->` / `<!-- apijack:generated:end -->` markers, replace content between them. If markers don't exist, append them to end.
- `renderPackageDocs` reads `template.md` from `import.meta.dir`, renders 3 variants (claude, gemini, generic) + skill file.
- `renderProjectDocs` reads `project-template.md`, renders with ProjectContext, writes to 5 locations (CLAUDE.md, AGENTS.md, GEMINI.md, .claude/skills/\<name\>/SKILL.md, .cursor/rules/apijack.md).

- [ ] **Step 5: Run tests — verify pass**

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/agent-docs/render.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/agent-docs/ tests/agent-docs/
git commit -m "feat: agent docs template renderer with append mode support"
```

---

### Task 2: Prepack Script + Package-Level Docs

**Files:**
- Create: `/home/gpremo-re/rational/apijack/scripts/prepack-agent-docs.ts`
- Create: `/home/gpremo-re/rational/apijack/CLAUDE.md` (generated)
- Create: `/home/gpremo-re/rational/apijack/AGENTS.md` (generated)
- Create: `/home/gpremo-re/rational/apijack/GEMINI.md` (generated)
- Create: `/home/gpremo-re/rational/apijack/skills/apijack/SKILL.md` (generated)
- Modify: `/home/gpremo-re/rational/apijack/package.json`

- [ ] **Step 1: Create prepack script**

Write `scripts/prepack-agent-docs.ts`:

```ts
import { renderPackageDocs } from "../src/agent-docs/render";
renderPackageDocs(import.meta.dir + "/..");
console.log("Generated package-level agent docs");
```

- [ ] **Step 2: Add prepack script to package.json**

Add to scripts: `"prepack": "bun run scripts/prepack-agent-docs.ts"`

- [ ] **Step 3: Run the prepack script manually**

```bash
cd /home/gpremo-re/rational/apijack && bun run scripts/prepack-agent-docs.ts
```

Verify files created:
```bash
test -f CLAUDE.md && test -f AGENTS.md && test -f GEMINI.md && test -f skills/apijack/SKILL.md && echo "All generated"
```

- [ ] **Step 4: Verify generated content**

- CLAUDE.md mentions Claude Code, skills, CLAUDE.md convention
- AGENTS.md is agent-agnostic
- GEMINI.md mentions Gemini, activate_skill
- skills/apijack/SKILL.md has frontmatter with name and description

- [ ] **Step 5: Commit**

```bash
git add scripts/ CLAUDE.md AGENTS.md GEMINI.md skills/ package.json
git commit -m "feat: prepack script generates package-level agent docs"
```

---

### Task 3: Wire Agent Docs into Generate Command

**Files:**
- Modify: `/home/gpremo-re/rational/apijack/src/cli-builder.ts`
- Modify: `/home/gpremo-re/rational/apijack/src/index.ts`
- Test: `/home/gpremo-re/rational/apijack/tests/agent-docs/generate-integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

Write `tests/agent-docs/generate-integration.test.ts` covering:
- After `generate`, agent doc files exist in the output directory
- `--no-agent-docs` flag skips agent doc generation
- `--agent-docs=overwrite` replaces files entirely
- Default append mode preserves existing content outside markers
- ProjectContext is correctly built from the generated command-map data

Use a temp directory and a minimal spec fixture to test the full generate flow.

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/agent-docs/generate-integration.test.ts
```
Expected: FAIL

- [ ] **Step 2: Modify cli-builder.ts**

In the `generate` command action (find where `fetchAndGenerate` is called):

1. Add options to the generate command:
   ```ts
   .option("--no-agent-docs", "Skip agent doc generation")
   .option("--agent-docs <mode>", "Agent docs mode: append (default) or overwrite", "append")
   ```

2. After `fetchAndGenerate()` returns, if `!opts.noAgentDocs`:
   - Read the generated `command-map.ts` file, parse the `commandMap` export to build `commands` array
   - Read routines from `~/.<cliName>/routines/` using `listRoutines()` — catch errors (dir may not exist)
   - Build `ProjectContext` with cliName, description, version from `options`
   - Call `renderProjectDocs(ctx, { outDir: process.cwd(), mode: opts.agentDocs })`

3. Log which agent doc files were generated

- [ ] **Step 3: Update index.ts exports**

Add to `src/index.ts`:
```ts
export { renderProjectDocs } from "./agent-docs/render";
export type { ProjectContext } from "./agent-docs/render";
```

- [ ] **Step 4: Run tests — verify pass**

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/agent-docs/
```

- [ ] **Step 5: Run full test suite**

```bash
cd /home/gpremo-re/rational/apijack && bun test
```
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli-builder.ts src/index.ts tests/agent-docs/
git commit -m "feat: generate command emits project-level agent docs"
```

---

### Task 4: MCP Server

**Files:**
- Create: `/home/gpremo-re/rational/apijack/src/mcp-server.ts`
- Test: `/home/gpremo-re/rational/apijack/tests/mcp-server.test.ts`
- Modify: `/home/gpremo-re/rational/apijack/src/cli-builder.ts`
- Modify: `/home/gpremo-re/rational/apijack/package.json`

- [ ] **Step 1: Add @modelcontextprotocol/sdk as optional dependency**

```bash
cd /home/gpremo-re/rational/apijack && bun add @modelcontextprotocol/sdk --optional
```

- [ ] **Step 2: Write failing tests for MCP server**

Write `tests/mcp-server.test.ts` covering:
- `createMcpTools()` returns all 9 tools with correct names and schemas
- `list_commands` tool reads command-map and returns filtered results
- `list_routines` tool reads routines directory
- `get_config` tool returns active env info (no password)
- `get_spec` tool returns spec summary
- `run_command` tool constructs correct CLI invocation
- `config_list` tool returns environment list
- `config_switch` tool calls switchEnvironment

Test the tool definitions and handlers, mocking the CLI execution and file system reads where needed.

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/mcp-server.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement mcp-server.ts**

Write `src/mcp-server.ts`:

```ts
import { resolve } from "path";
import { homedir } from "os";

export interface McpServerOptions {
  cliName: string;
  cliInvocation: string[]; // e.g. ["bun", "run", "src/cli.ts"] or ["/path/to/binary"]
  generatedDir: string;
  routinesDir: string;
  configDir: string;
}

export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  // Dynamic import — fails gracefully if not installed
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = new McpServer({
    name: `${opts.cliName}-mcp`,
    version: "1.0.0",
  });

  // Register all 9 tools...
  // Action tools: run_command, run_routine, generate, config_switch, config_list
  // Read-only tools: list_commands, list_routines, get_config, get_spec

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Action tools** shell out via:
```ts
const proc = Bun.spawn([...opts.cliInvocation, ...args], { stdout: "pipe", stderr: "pipe" });
const output = await new Response(proc.stdout).text();
```

**Read-only tools** read from disk:
- `list_commands`: import or parse `opts.generatedDir/command-map.ts`
- `list_routines`: use `listRoutines(opts.routinesDir)` from `./routine/loader`
- `get_config`: use `getActiveEnvConfig(opts.cliName)` from `./config` (strip password)
- `get_spec`: read `opts.generatedDir/types.ts`, count interfaces/types

- [ ] **Step 4: Run MCP server tests — verify pass**

```bash
cd /home/gpremo-re/rational/apijack && bun test tests/mcp-server.test.ts
```

- [ ] **Step 5: Register mcp subcommand in cli-builder.ts**

Add to the built-in commands section of `cli-builder.ts`:

```ts
program
  .command("mcp")
  .description("Start MCP server for AI agent integration")
  .action(async () => {
    try {
      const { startMcpServer } = await import("./mcp-server");
      await startMcpServer({
        cliName: options.name,
        cliInvocation: process.argv.slice(0, 2),
        generatedDir: resolve(options.generatedDir || "src/generated"),
        routinesDir: `${homedir()}/.${options.name}/routines`,
        configDir: `${homedir()}/.${options.name}`,
      });
    } catch (e: any) {
      if (e?.code === "MODULE_NOT_FOUND" || e?.message?.includes("Cannot find module")) {
        console.error("MCP server requires @modelcontextprotocol/sdk");
        console.error("Install it: bun add @modelcontextprotocol/sdk");
        process.exit(1);
      }
      throw e;
    }
  });
```

- [ ] **Step 6: Run full test suite**

```bash
cd /home/gpremo-re/rational/apijack && bun test
```
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/mcp-server.ts tests/mcp-server.test.ts src/cli-builder.ts package.json
git commit -m "feat: MCP server with 9 tools for AI agent integration"
```

---

### Task 5: End-to-End Verification + Push

- [ ] **Step 1: Run full test suite**

```bash
cd /home/gpremo-re/rational/apijack && bun test
```
Expected: ALL PASS

- [ ] **Step 2: Verify no product-specific references**

```bash
cd /home/gpremo-re/rational/apijack
grep -ri "old-name\|old-vendor.review\|old-vendor.enterprise" src/ tests/ scripts/ CLAUDE.md AGENTS.md GEMINI.md skills/ || echo "CLEAN"
```
Expected: CLEAN

- [ ] **Step 3: Verify package-level docs exist**

```bash
test -f CLAUDE.md && test -f AGENTS.md && test -f GEMINI.md && test -f skills/apijack/SKILL.md && echo "All package docs present"
```

- [ ] **Step 4: Test generate with agent docs against example server**

```bash
cd /home/gpremo-re/rational/apijack/examples/bun-api && bun run server.ts &
sleep 2
cd /tmp/test-project
mkdir -p /tmp/test-project && cd /tmp/test-project
# Simulate a consumer project generate
bun -e "
  const { generate } = require('/home/gpremo-re/rational/apijack/src/codegen/index.ts');
  const spec = require('/tmp/spec.json');
  generate({ spec, outDir: '/tmp/test-project/src/generated' });
"
# Fetch spec first
curl -s -u admin:password http://localhost:3456/v3/api-docs -o /tmp/spec.json
kill %1
```

- [ ] **Step 5: Push**

```bash
cd /home/gpremo-re/rational/apijack && git push
```
