import { describe, expect, it } from "bun:test";
import { generateCommands } from "../../src/codegen/commands";
import type {
  OpenApiOperation,
  OpenApiSchema,
} from "../../src/codegen/openapi-types";
import fixture from "../fixtures/petstore.json";

const schemas = fixture.components.schemas as Record<string, any>;

describe("generateCommands — unit tests", () => {
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
    expect(output).toContain('--itemCount <value>');
  });

  it("imports the generic ApiClient class", () => {
    const output = generateCommands({});
    expect(output).toContain("ApiClient");
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

describe("generateCommands — petstore fixture", () => {
  const output = generateCommands(fixture.paths as any, schemas);

  it("accepts onResult callback parameter", () => {
    expect(output).toContain("onResult: OutputHandler");
  });

  it("creates tag-based subcommand groups", () => {
    expect(output).toContain('.command("admin")');
    expect(output).toContain('.command("matters")');
    expect(output).toContain('.command("users")');
  });

  it("maps GET collection to list verb", () => {
    expect(output).toContain('.command("list")');
  });

  it("maps GET with path param to get verb", () => {
    expect(output).toContain('.command("get');
  });

  it("maps POST to create verb", () => {
    expect(output).toContain('.command("create")');
  });

  it("maps DELETE to delete verb", () => {
    expect(output).toContain('.command("delete');
  });

  it("adds path params as required arguments", () => {
    expect(output).toContain("<matterId>");
  });

  it("adds query params as options", () => {
    expect(output).toContain("--status");
  });

  // Operation descriptions
  it("uses operation summary in command description", () => {
    expect(output).toContain("List all items");
  });

  it("includes HTTP method and path in description", () => {
    expect(output).toContain("GET /described/items");
  });

  // Property descriptions on options
  it("uses property description in option help text", () => {
    expect(output).toContain("Display name of the item");
  });

  // Required flags
  it("uses requiredOption for required body properties", () => {
    expect(output).toContain(".requiredOption(");
    expect(output).toContain("(required)");
  });

  // readOnly exclusion
  it("excludes readOnly properties from CLI flags", () => {
    const describedCreateBlock = output.split('"createItem"')[1]?.split(".action(")[0] || "";
    expect(describedCreateBlock).not.toContain("--id ");
    expect(describedCreateBlock).not.toContain("--created-on");
  });

  // Format hints
  it("includes format hint in option description", () => {
    expect(output).toContain("(email)");
  });

  // Default values
  it("includes default value in option description", () => {
    expect(output).toContain("(default: 0)");
  });

  // Deprecated
  it("marks deprecated operations in description", () => {
    expect(output).toContain("[DEPRECATED]");
  });

  // Query param descriptions
  it("uses query parameter description in option help", () => {
    expect(output).toContain("Page number to retrieve");
  });
});
