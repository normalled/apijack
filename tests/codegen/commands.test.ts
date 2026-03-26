import { describe, expect, it } from "bun:test";
import { generateCommands } from "../../src/codegen/commands";
import type {
  OpenApiOperation,
  OpenApiSchema,
} from "../../src/codegen/openapi-types";

describe("generateCommands", () => {
  it("groups commands by normalized tags", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/admin/users": {
        get: {
          operationId: "listUsers",
          tags: ["Admin : Users"],
        },
      },
      "/admin/roles": {
        get: {
          operationId: "listRoles",
          tags: ["Admin : Roles"],
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('.command("admin")');
    expect(output).toContain('.command("users")');
    expect(output).toContain('.command("roles")');
  });

  it("GET without path params produces list verb", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('.command("list")');
  });

  it("GET with path params produces get verb", () => {
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
    const output = generateCommands(paths);
    expect(output).toContain('.command("get <id>")');
  });

  it("POST produces create verb", () => {
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
      },
    };
    const schemas: Record<string, OpenApiSchema> = {
      CreateItemDto: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    };
    const output = generateCommands(paths, schemas);
    expect(output).toContain('.command("create")');
  });

  it("PUT produces update verb", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items/{id}": {
        put: {
          operationId: "updateItem",
          tags: ["items"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('.command("update <id>")');
  });

  it("DELETE produces delete verb", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items/{id}": {
        delete: {
          operationId: "deleteItem",
          tags: ["items"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('.command("delete <id>")');
  });

  it("verb deduplication falls back to operationId kebab-case", () => {
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
    const output = generateCommands(paths);
    // Both are GET without path params, so both get "list" verb initially
    // With dedup, they fall back to operationId kebab-case
    expect(output).toContain('.command("list-items")');
    expect(output).toContain('.command("search-items")');
  });

  it("resolves body props to individual CLI flags", () => {
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
      },
    };
    const schemas: Record<string, OpenApiSchema> = {
      CreateItemDto: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          itemCount: { type: "integer" },
        },
      },
    };
    const output = generateCommands(paths, schemas);
    expect(output).toContain('--name <value>');
    expect(output).toContain('--description <value>');
    expect(output).toContain('--item-count <value>');
  });

  it("includes --body and --body-file overrides for endpoints with body", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        post: {
          operationId: "createItem",
          tags: ["items"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('--body <json>');
    expect(output).toContain('--body-file <path>');
  });

  it("imports ApiClient not HardcodedClient", () => {
    const output = generateCommands({});
    expect(output).toContain("ApiClient");
    expect(output).not.toContain("HardcodedClient");
  });

  it("includes auto-generated header", () => {
    const output = generateCommands({});
    expect(output).toContain("// Auto-generated");
  });

  it("generates query param options", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          tags: ["items"],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            {
              name: "sort",
              in: "query",
              schema: { type: "string", enum: ["asc", "desc"] },
            },
          ],
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('--page <page>');
    expect(output).toContain('--sort <sort>');
    expect(output).toContain("[asc, desc]");
  });

  it("uses default tag when no tags specified", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
        },
      },
    };
    const output = generateCommands(paths);
    expect(output).toContain('.command("default")');
  });

  it("calls client method with correct arguments in action", () => {
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
    const output = generateCommands(paths);
    expect(output).toContain("client.getItem(id)");
    expect(output).toContain("onResult(result)");
  });
});
