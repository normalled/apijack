import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { generate } from "../../src/codegen/index";
import { existsSync, rmSync } from "fs";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const minimalSpec = {
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        tags: ["items"],
        parameters: [
          {
            name: "page",
            in: "query" as const,
            schema: { type: "integer" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createItem",
        tags: ["items"],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Item" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/items/{id}": {
      get: {
        operationId: "getItem",
        tags: ["items"],
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
      delete: {
        operationId: "deleteItem",
        tags: ["items"],
        parameters: [
          {
            name: "id",
            in: "path" as const,
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: { "204": { description: "Deleted" } },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          active: { type: "boolean" },
        },
      },
      Status: {
        enum: ["ACTIVE", "INACTIVE"],
      },
    },
  },
};

describe("generate", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "swagger-jack-test-"));
  });

  afterEach(() => {
    if (outDir && existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("writes all 4 files to outDir", async () => {
    await generate({ spec: minimalSpec, outDir });

    expect(existsSync(join(outDir, "types.ts"))).toBe(true);
    expect(existsSync(join(outDir, "client.ts"))).toBe(true);
    expect(existsSync(join(outDir, "commands.ts"))).toBe(true);
    expect(existsSync(join(outDir, "command-map.ts"))).toBe(true);
  });

  it("creates outDir if it does not exist", async () => {
    const nested = join(outDir, "deep", "nested", "dir");
    expect(existsSync(nested)).toBe(false);

    await generate({ spec: minimalSpec, outDir: nested });

    expect(existsSync(nested)).toBe(true);
    expect(existsSync(join(nested, "types.ts"))).toBe(true);
    expect(existsSync(join(nested, "client.ts"))).toBe(true);
    expect(existsSync(join(nested, "commands.ts"))).toBe(true);
    expect(existsSync(join(nested, "command-map.ts"))).toBe(true);
  });

  it("types.ts contains interfaces and type declarations", async () => {
    await generate({ spec: minimalSpec, outDir });
    const content = await Bun.file(join(outDir, "types.ts")).text();

    expect(content).toContain("// Auto-generated");
    expect(content).toContain("export interface Item {");
    expect(content).toContain("  id?: number;");
    expect(content).toContain("  name?: string;");
    expect(content).toContain("  active?: boolean;");
    expect(content).toContain('export type Status = "ACTIVE" | "INACTIVE";');
  });

  it("client.ts contains ApiClient class", async () => {
    await generate({ spec: minimalSpec, outDir });
    const content = await Bun.file(join(outDir, "client.ts")).text();

    expect(content).toContain("// Auto-generated");
    expect(content).toContain("export class ApiClient");
    expect(content).toContain("HeadersProvider");
    expect(content).toContain("listItems");
    expect(content).toContain("getItem");
    expect(content).toContain("createItem");
    expect(content).toContain("deleteItem");
  });

  it("commands.ts contains registerGeneratedCommands", async () => {
    await generate({ spec: minimalSpec, outDir });
    const content = await Bun.file(join(outDir, "commands.ts")).text();

    expect(content).toContain("// Auto-generated");
    expect(content).toContain("registerGeneratedCommands");
  });

  it("command-map.ts contains commandMap export", async () => {
    await generate({ spec: minimalSpec, outDir });
    const content = await Bun.file(join(outDir, "command-map.ts")).text();

    expect(content).toContain("// Auto-generated");
    expect(content).toContain("commandMap");
  });

  it("handles spec with no schemas", async () => {
    const specNoSchemas = {
      paths: {
        "/health": {
          get: {
            operationId: "healthCheck",
            tags: ["system"],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    await generate({ spec: specNoSchemas, outDir });

    const types = await Bun.file(join(outDir, "types.ts")).text();
    expect(types).toContain("// Auto-generated");

    const client = await Bun.file(join(outDir, "client.ts")).text();
    expect(client).toContain("healthCheck");
  });

  it("handles spec with empty paths", async () => {
    const emptySpec = {
      paths: {},
      components: { schemas: {} },
    };

    await generate({ spec: emptySpec, outDir });

    expect(existsSync(join(outDir, "types.ts"))).toBe(true);
    expect(existsSync(join(outDir, "client.ts"))).toBe(true);
    expect(existsSync(join(outDir, "commands.ts"))).toBe(true);
    expect(existsSync(join(outDir, "command-map.ts"))).toBe(true);
  });
});
