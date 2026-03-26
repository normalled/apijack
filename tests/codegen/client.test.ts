import { describe, expect, it } from "bun:test";
import { generateClient } from "../../src/codegen/client";
import type { OpenApiOperation } from "../../src/codegen/openapi-types";

describe("generateClient", () => {
  it("generates the generic ApiClient class", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {};
    const output = generateClient(paths);
    expect(output).toContain("export class ApiClient {");
  });

  it("exports HeadersProvider type", () => {
    const paths: Record<string, Record<string, OpenApiOperation>> = {};
    const output = generateClient(paths);
    expect(output).toContain(
      "export type HeadersProvider = () => Record<string, string>;",
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
    expect(output).toContain("async getItem(id: number): Promise<unknown>");
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
      "async createItem(body: CreateItemDto): Promise<unknown>",
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
      "async updateItem(id: number, body: UpdateItemDto, params?: { notify?: boolean }): Promise<unknown>",
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
});
