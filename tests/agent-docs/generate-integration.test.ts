import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  renderProjectDocs,
  listRoutinesStructured,
  type ProjectContext,
} from "../../src/agent-docs/render";

const TEST_DIR = join(tmpdir(), `agent-docs-gen-integration-${Date.now()}`);

function makeTestDir() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanTestDir() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    cliName: "testapi",
    description: "Test API CLI tool",
    version: "2.0.0",
    commands: [
      { path: "GET /items", operationId: "listItems", description: "List all items", hasBody: false },
      { path: "POST /items", operationId: "createItem", description: "Create an item", hasBody: true },
      { path: "GET /items/{id}", operationId: "getItem", description: "Get item by ID", hasBody: false },
      { path: "PUT /items/{id}", operationId: "updateItem", description: "Update an item", hasBody: true },
      { path: "DELETE /items/{id}", operationId: "deleteItem", description: "Delete an item", hasBody: false },
    ],
    routines: [
      { name: "setup-env" },
      { name: "integration/smoke-test", description: "Quick smoke test" },
    ],
    ...overrides,
  };
}

// ─── Files exist after renderProjectDocs ─────────────────────────────

describe("generate integration: files exist in output dir", () => {
  beforeEach(makeTestDir);
  afterEach(cleanTestDir);

  test("all expected doc files are created", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });

    expect(existsSync(join(TEST_DIR, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "GEMINI.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".cursor", "rules", "apijack.md"))).toBe(true);
    expect(existsSync(join(TEST_DIR, ".claude", "skills", "testapi", "SKILL.md"))).toBe(true);
  });

  test("skill directory uses the cli name from context", () => {
    const ctx = makeContext({ cliName: "customcli" });
    renderProjectDocs(ctx, { outDir: TEST_DIR });

    expect(existsSync(join(TEST_DIR, ".claude", "skills", "customcli", "SKILL.md"))).toBe(true);
  });
});

// ─── Files contain CLI name and command inventory ────────────────────

describe("generate integration: content contains CLI name and commands", () => {
  beforeEach(makeTestDir);
  afterEach(cleanTestDir);

  test("CLAUDE.md contains the CLI name", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).toContain("testapi");
  });

  test("CLAUDE.md contains description and version", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).toContain("Test API CLI tool");
    expect(content).toContain("2.0.0");
  });

  test("all doc files contain the command inventory", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });

    for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
      const content = read(join(TEST_DIR, file));
      expect(content).toContain("listItems");
      expect(content).toContain("createItem");
      expect(content).toContain("getItem");
      expect(content).toContain("updateItem");
      expect(content).toContain("deleteItem");
      expect(content).toContain("GET /items");
      expect(content).toContain("POST /items");
    }
  });

  test("routine names appear in doc files", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).toContain("setup-env");
    expect(content).toContain("integration/smoke-test");
  });

  test("SKILL.md contains frontmatter and CLI name", () => {
    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, ".claude", "skills", "testapi", "SKILL.md"));

    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: testapi");
    expect(content).toContain("testapi");
  });

  test("empty commands array produces no command rows", () => {
    const ctx = makeContext({ commands: [] });
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    // Should still have the header but no operationId rows
    expect(content).toContain("Command Inventory");
    expect(content).not.toContain("listItems");
  });

  test("empty routines array produces no routine entries", () => {
    const ctx = makeContext({ routines: [] });
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).not.toContain("setup-env");
  });
});

// ─── Default mode is append ──────────────────────────────────────────

describe("generate integration: default mode is append", () => {
  beforeEach(makeTestDir);
  afterEach(cleanTestDir);

  test("preserves existing content when no mode specified", () => {
    const existing = "# My Project Notes\n\nHand-written documentation here.\n";
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    // Existing content preserved
    expect(content).toContain("Hand-written documentation here.");
    // Generated content appended with markers
    expect(content).toContain("<!-- apijack:generated:start -->");
    expect(content).toContain("<!-- apijack:generated:end -->");
    expect(content).toContain("testapi");
  });

  test("replaces content between existing markers on re-run", () => {
    // First run
    const ctx = makeContext({ version: "1.0.0" });
    const existing =
      "# Project\n\n" +
      "<!-- apijack:generated:start -->\nOLD GENERATED CONTENT\n<!-- apijack:generated:end -->\n\n" +
      "# Footer\n";
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

    // Second run with updated version
    const updatedCtx = makeContext({ version: "3.0.0" });
    renderProjectDocs(updatedCtx, { outDir: TEST_DIR });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).not.toContain("OLD GENERATED CONTENT");
    expect(content).toContain("3.0.0");
    expect(content).toContain("# Footer");
    expect(content).toContain("# Project");
  });

  test("append preserves content across all three doc files", () => {
    for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
      writeFileSync(join(TEST_DIR, file), `# Custom ${file} content\n`);
    }

    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR });

    for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
      const content = read(join(TEST_DIR, file));
      expect(content).toContain(`Custom ${file} content`);
      expect(content).toContain("testapi");
    }
  });
});

// ─── Overwrite mode replaces files ───────────────────────────────────

describe("generate integration: overwrite mode replaces files", () => {
  beforeEach(makeTestDir);
  afterEach(cleanTestDir);

  test("overwrite replaces existing content entirely", () => {
    const existing = "# Old Content\n\nThis should be completely gone.\n";
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR, mode: "overwrite" });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    expect(content).not.toContain("This should be completely gone.");
    expect(content).not.toContain("Old Content");
    expect(content).toContain("testapi");
    expect(content).toContain("listItems");
  });

  test("overwrite does not include marker tags", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "old stuff\n");

    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR, mode: "overwrite" });
    const content = read(join(TEST_DIR, "CLAUDE.md"));

    // In overwrite mode, markers are not used since the file is fully replaced
    expect(content).not.toContain("<!-- apijack:generated:start -->");
    expect(content).not.toContain("<!-- apijack:generated:end -->");
  });

  test("overwrite replaces all three doc files", () => {
    for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
      writeFileSync(join(TEST_DIR, file), `# Old ${file}\n\nOld content for ${file}.\n`);
    }

    const ctx = makeContext();
    renderProjectDocs(ctx, { outDir: TEST_DIR, mode: "overwrite" });

    for (const file of ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]) {
      const content = read(join(TEST_DIR, file));
      expect(content).not.toContain(`Old content for ${file}`);
      expect(content).toContain("testapi");
    }
  });
});

// ─── listRoutinesStructured integration ──────────────────────────────

describe("generate integration: listRoutinesStructured with realistic data", () => {
  beforeEach(makeTestDir);
  afterEach(cleanTestDir);

  test("routines from structured dir flow into renderProjectDocs", () => {
    // Create realistic routines directory
    const routinesDir = join(TEST_DIR, "routines");
    const subDir = join(routinesDir, "deploy");
    mkdirSync(subDir, { recursive: true });

    writeFileSync(
      join(routinesDir, "health-check.yaml"),
      "name: health-check\nsteps:\n  - name: ping\n    command: status check\n",
    );
    writeFileSync(
      join(subDir, "routine.yaml"),
      "name: deploy\nsteps:\n  - name: push\n    command: deploy run\n",
    );

    // Get structured routines
    const routines = listRoutinesStructured(routinesDir);
    expect(routines.length).toBeGreaterThan(0);

    // Feed them into renderProjectDocs
    const outDir = join(TEST_DIR, "docs-out");
    mkdirSync(outDir, { recursive: true });

    const ctx = makeContext({ routines });
    renderProjectDocs(ctx, { outDir });

    const content = read(join(outDir, "CLAUDE.md"));
    for (const r of routines) {
      expect(content).toContain(r.name);
    }
  });
});
