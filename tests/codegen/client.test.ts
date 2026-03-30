import { describe, expect, it } from "bun:test";
import { generateClient } from "../../src/codegen/client";
import type { OpenApiOperation } from "../../src/codegen/openapi-types";
import fixture from "../fixtures/petstore.json";

const schemas = fixture.components.schemas as Record<string, any>;

describe("generateClient — unit tests", () => {
  it("generates the generic ApiClient class", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {};
    const output = generateClient(paths);
    expect(output).toContain("export class ApiClient {");
  });

  it("exports HeadersProvider type", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {};
    const output = generateClient(paths);
    expect(output).toContain(
      "export type HeadersProvider = (method: string) => Record<string, string>;",
    );
  });

  it("generates method with path params for GET endpoint", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items/{id}": {
        get: {
          operationId: "getItem",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateClient(paths);
    expect(output).toContain("async getItem(id: number)");
    // Path template uses backtick interpolation for path params
    expect(output).toContain("return this.request(\"GET\", `/items/${id}`");
  });

  it("generates method with body param for POST endpoint", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        post: {
          operationId: "createItem",
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
    const output = generateClient(paths);
    expect(output).toContain(
      "async createItem(body: CreateItemDto)",
    );
    expect(output).toContain(", { body }");
  });

  it("passes query params through", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "size", in: "query", schema: { type: "integer" } },
          ],
        },
      },
    };
    const output = generateClient(paths);
    expect(output).toContain("params?: { page?: number; size?: number }");
    expect(output).toContain(", { params }");
  });

  it("handles endpoint with path params, body, and query params", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items/{id}": {
        put: {
          operationId: "updateItem",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
            { name: "notify", in: "query", schema: { type: "boolean" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateItemDto" },
              },
            },
          },
        },
      },
    };
    const output = generateClient(paths);
    expect(output).toContain(
      "async updateItem(id: number, body: UpdateItemDto, params?: { notify?: boolean })",
    );
    expect(output).toContain(", { params, body }");
  });

  it("includes auto-generated header", () => {
    const output = generateClient({});
    expect(output).toContain("// Auto-generated");
  });

  it("includes request method with fetch logic", () => {
    const output = generateClient({});
    expect(output).toContain("private async request(");
    expect(output).toContain("fetch(");
    expect(output).toContain("JSON.stringify");
  });

  it("skips operations without operationId", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          tags: ["items"],
          // no operationId
        },
      },
    };
    const output = generateClient(paths);
    // Should only have the class shell, no methods beyond request
    expect(output).not.toContain("async list");
  });

  it("generates correct path template for endpoint without path params", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {
      "/items": {
        get: {
          operationId: "listItems",
        },
      },
    };
    const output = generateClient(paths);
    expect(output).toContain('return this.request("GET", "/items")');
  });

  it("generates dryRun property on ApiClient", () => {
    const output = generateClient({});
    expect(output).toContain("dryRun = false");
  });

  it("generates CapturedRequest return path when dryRun is true", () => {
    const output = generateClient({});
    expect(output).toContain("if (this.dryRun)");
    expect(output).toContain("return { method, url:");
  });
});

describe("generateClient — petstore fixture", () => {
  const output = generateClient(fixture.paths as any, schemas);

  it("generates class with method per operationId", () => {
    expect(output).toContain("export class ApiClient {");
    expect(output).toContain("async adminGetMatters(");
    expect(output).toContain("async adminCreateMatter(");
    expect(output).toContain("async adminGetMatter(");
    expect(output).toContain("async adminDeleteMatter(");
    expect(output).toContain("async getUsers(");
  });

  it("path params become method parameters", () => {
    expect(output).toContain("matterId: number");
  });

  it("query params become optional params object", () => {
    expect(output).toContain("params?: { status?: string }");
  });

  it("request body becomes body parameter", () => {
    expect(output).toContain("body: CreateMatterRequest");
  });

  it("generates correct HTTP method in request call", () => {
    expect(output).toContain(`this.request("GET", "/admin/matters"`);
    expect(output).toContain(`this.request("POST", "/admin/matters"`);
    expect(output).toContain(`this.request("DELETE", \`/admin/matters/\${matterId}\``);
  });

  // Response types
  it("typed return for $ref response", () => {
    expect(output).toMatch(/async adminGetMatter\(.*\): Promise<MatterDto>/);
  });

  it("typed return for array response", () => {
    expect(output).toMatch(/async adminGetMatters\(.*\): Promise<MatterDto\[\]>/);
  });

  it("void return for no-body response", () => {
    expect(output).toMatch(/async adminDeleteMatter\(.*\): Promise<void>/);
  });

  it("typed return for 201 response", () => {
    expect(output).toMatch(/async createItem\(.*\): Promise<DescribedDto>/);
  });

  // Type imports
  it("generates import statement for referenced types", () => {
    expect(output).toContain('import type {');
    expect(output).toContain("MatterDto");
    expect(output).toContain("CreateMatterRequest");
    expect(output).toContain("DescribedDto");
    expect(output).toContain('} from "./types";');
  });

  // Operation JSDoc
  it("emits operation summary as JSDoc", () => {
    expect(output).toContain("/** List all items");
  });

  it("emits operation description in JSDoc body", () => {
    expect(output).toContain("Returns a paginated list of items matching the filter criteria");
  });

  it("emits HTTP method and path in JSDoc", () => {
    expect(output).toContain("GET /described/items");
    expect(output).toContain("POST /described/items");
  });

  it("emits @param tags with descriptions", () => {
    expect(output).toContain("@param itemId");
    expect(output).toContain("The unique item identifier");
  });

  it("emits @param for body with description", () => {
    expect(output).toContain("@param body");
  });

  // Deprecated
  it("deprecated operation emits @deprecated JSDoc", () => {
    expect(output).toContain("@deprecated");
    expect(output).toContain("Delete an item");
  });
});
