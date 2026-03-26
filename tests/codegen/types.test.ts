import { describe, expect, it } from "bun:test";
import { generateTypes } from "../../src/codegen/types";
import type { OpenApiSchema } from "../../src/codegen/openapi-types";

describe("generateTypes", () => {
  it("generates a simple interface with properties", () => {
    const schemas: Record<string, OpenApiSchema> = {
      User: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
          active: { type: "boolean" },
        },
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export interface User {");
    expect(output).toContain("  name?: string;");
    expect(output).toContain("  age?: number;");
    expect(output).toContain("  active?: boolean;");
    expect(output).toContain("}");
  });

  it("generates an enum as a union type", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Status: {
        enum: ["ACTIVE", "INACTIVE", "PENDING"],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain(
      'export type Status = "ACTIVE" | "INACTIVE" | "PENDING";',
    );
  });

  it("generates allOf as intersection type", () => {
    const schemas: Record<string, OpenApiSchema> = {
      AdminUser: {
        allOf: [
          { $ref: "#/components/schemas/User" },
          { $ref: "#/components/schemas/AdminRole" },
        ],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export type AdminUser = User & AdminRole;");
  });

  it("generates oneOf as union type", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Shape: {
        oneOf: [
          { $ref: "#/components/schemas/Circle" },
          { $ref: "#/components/schemas/Square" },
        ],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export type Shape = Circle | Square;");
  });

  it("generates anyOf as union type", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Input: {
        anyOf: [
          { $ref: "#/components/schemas/TextInput" },
          { $ref: "#/components/schemas/NumberInput" },
        ],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export type Input = TextInput | NumberInput;");
  });

  it("handles $ref properties", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Order: {
        type: "object",
        properties: {
          item: { $ref: "#/components/schemas/Product" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("  item?: Product;");
    expect(output).toContain("  tags?: string[];");
  });

  it("handles nullable properties", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Profile: {
        type: "object",
        properties: {
          bio: { type: "string", nullable: true },
        },
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("  bio?: string | null;");
  });

  it("includes auto-generated header", () => {
    const output = generateTypes({});
    expect(output).toContain("// Auto-generated");
  });

  it("generates multiple schemas", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Foo: {
        type: "object",
        properties: {
          x: { type: "string" },
        },
      },
      Bar: {
        enum: ["A", "B"],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export interface Foo {");
    expect(output).toContain('export type Bar = "A" | "B";');
  });

  it("handles schema with properties but no explicit type", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Implicit: {
        properties: {
          value: { type: "number" },
        },
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export interface Implicit {");
    expect(output).toContain("  value?: number;");
  });

  it("handles allOf with non-$ref parts as unknown", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Mixed: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { extra: { type: "string" } } },
        ],
      },
    };
    const output = generateTypes(schemas);
    expect(output).toContain("export type Mixed = Base & unknown;");
  });
});
