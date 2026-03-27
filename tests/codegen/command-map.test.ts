import { describe, expect, it } from "bun:test";
import { generateCommandMap } from "../../src/codegen/command-map";
import type {
  OpenApiOperation,
  OpenApiSchema,
} from "../../src/codegen/openapi-types";
import fixture from "../fixtures/petstore.json";

const schemas = fixture.components.schemas as Record<string, any>;

describe("generateCommandMap — unit tests", () => {
  it("generates correct command path to operationId mapping", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
        },
      },
      "/items/{id}": {
        get: {
          operationId: "getItem",
          tags: ["items"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('"items list"');
    expect(output).toContain('operationId: "listItems"');
    expect(output).toContain('"items get"');
    expect(output).toContain('operationId: "getItem"');
  });

  it("detects path params correctly", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items/{id}": {
        get: {
          operationId: "getItem",
          tags: ["items"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('pathParams: ["id"]');
  });

  it("detects query params correctly", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "size", in: "query", schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('queryParams: ["page", "size"]');
  });

  it("detects hasBody correctly", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        post: {
          operationId: "createItem",
          tags: ["items"],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateItemDto" },
              },
            },
          },
        },
        get: {
          operationId: "listItems",
          tags: ["items"],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('"items create": { operationId: "createItem"');
    expect(output).toContain("hasBody: true");
    expect(output).toContain('"items list": { operationId: "listItems"');
    expect(output).toContain("hasBody: false");
  });

  it("verb deduplication matches command generation", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
        },
      },
      "/items/search": {
        get: {
          operationId: "searchItems",
          tags: ["items"],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('"items list-items"');
    expect(output).toContain('"items search-items"');
  });

  it("handles multi-level tag grouping", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/admin/users": {
        get: {
          operationId: "listAdminUsers",
          tags: ["Admin : Users"],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain('"admin users list"');
  });

  it("includes CommandMapping interface", () => {
    const output = generateCommandMap({});
    expect(output).toContain("export interface CommandMapping");
    expect(output).toContain("operationId: string;");
    expect(output).toContain("pathParams: string[];");
    expect(output).toContain("queryParams: string[];");
    expect(output).toContain("hasBody: boolean;");
  });

  it("exports commandMap as Record<string, CommandMapping>", () => {
    const output = generateCommandMap({});
    expect(output).toContain(
      "export const commandMap: Record<string, CommandMapping>",
    );
  });

  it("includes auto-generated header", () => {
    const output = generateCommandMap({});
    expect(output).toContain("// Auto-generated");
  });

  it("handles empty path params and query params", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
        },
      },
    };
    const output = generateCommandMap(paths);
    expect(output).toContain("pathParams: []");
    expect(output).toContain("queryParams: []");
  });
});

describe("generateCommandMap — petstore fixture", () => {
  const output = generateCommandMap(fixture.paths as any, schemas);

  it("exports a commandMap object", () => {
    expect(output).toContain("export const commandMap");
  });

  it("maps command path to operationId", () => {
    expect(output).toContain("adminGetMatters");
  });

  it("includes pathParams list", () => {
    expect(output).toContain('"matterId"');
  });

  it("includes hasBody flag", () => {
    expect(output).toContain("hasBody: true");
    expect(output).toContain("hasBody: false");
  });

  it("CommandMapping interface includes description field", () => {
    expect(output).toContain("description?: string;");
  });

  it("includes operation summary as description", () => {
    expect(output).toContain('description: "List all items"');
  });

  it("omits description when operation has no summary", () => {
    const adminLine = output.split("\n").find((l) => l.includes("adminGetMatters"));
    expect(adminLine).not.toContain("description:");
  });
});
