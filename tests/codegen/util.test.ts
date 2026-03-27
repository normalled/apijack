import { describe, expect, it } from "bun:test";
import {
  normalizeTag,
  resolveType,
  refToName,
  schemaToTsType,
  sanitizeVar,
  capitalize,
  resolveSchemaProps,
  buildJsDoc,
  resolveResponseType,
  sanitizeTypeName,
} from "../../src/codegen/util";
import type { OpenApiSchema } from "../../src/codegen/openapi-types";

describe("normalizeTag", () => {
  it("splits on colons and whitespace", () => {
    expect(normalizeTag("Admin : Matters")).toEqual(["admin", "matters"]);
  });

  it("preserves hyphens within tokens", () => {
    expect(normalizeTag("user-profile")).toEqual(["user-profile"]);
  });

  it("splits on slashes and whitespace", () => {
    expect(normalizeTag("Content Extraction / Loads")).toEqual([
      "content",
      "extraction",
      "loads",
    ]);
  });

  it("lowercases all tokens", () => {
    expect(normalizeTag("FOO BAR")).toEqual(["foo", "bar"]);
  });

  it("strips leading/trailing hyphens from tokens", () => {
    expect(normalizeTag("-foo-")).toEqual(["foo"]);
  });

  it("handles single-word tag", () => {
    expect(normalizeTag("admin")).toEqual(["admin"]);
  });
});

describe("resolveType", () => {
  it("resolves string type", () => {
    expect(resolveType({ type: "string" })).toBe("string");
  });

  it("resolves integer type as number", () => {
    expect(resolveType({ type: "integer" })).toBe("number");
  });

  it("resolves number type", () => {
    expect(resolveType({ type: "number" })).toBe("number");
  });

  it("resolves boolean type", () => {
    expect(resolveType({ type: "boolean" })).toBe("boolean");
  });

  it("resolves $ref", () => {
    expect(resolveType({ $ref: "#/components/schemas/Foo" })).toBe("Foo");
  });

  it("resolves array of strings", () => {
    expect(resolveType({ type: "array", items: { type: "string" } })).toBe(
      "string[]",
    );
  });

  it("resolves array of $ref", () => {
    expect(
      resolveType({
        type: "array",
        items: { $ref: "#/components/schemas/Bar" },
      }),
    ).toBe("Bar[]");
  });

  it("resolves nullable type", () => {
    expect(resolveType({ type: "string", nullable: true })).toBe(
      "string | null",
    );
  });

  it("resolves string enum", () => {
    expect(
      resolveType({ type: "string", enum: ["A", "B", "C"] }),
    ).toBe('"A" | "B" | "C"');
  });

  it("resolves plain object type as Record", () => {
    expect(resolveType({ type: "object" })).toBe("Record<string, unknown>");
  });

  it("resolves object with properties as inline object literal at depth 0", () => {
    const result = resolveType({ type: "object", properties: { foo: { type: "string" } } });
    expect(result).toContain("{");
    expect(result).toContain("foo");
    expect(result).toContain("string");
  });

  it("resolves object at depth 3+ as Record", () => {
    const result = resolveType(
      { type: "object", properties: { foo: { type: "string" } } },
      {},
      3,
    );
    expect(result).toBe("Record<string, unknown>");
  });

  it("returns unknown for unrecognized schemas", () => {
    expect(resolveType({})).toBe("unknown");
  });

  it("wraps union items in parens for array", () => {
    const result = resolveType({
      type: "array",
      items: {
        oneOf: [
          { $ref: "#/components/schemas/A" },
          { $ref: "#/components/schemas/B" },
        ],
      },
    });
    expect(result).toBe("(A | B)[]");
  });

  it("resolves allOf in property type", () => {
    const result = resolveType({
      allOf: [
        { $ref: "#/components/schemas/Base" },
        { $ref: "#/components/schemas/Extra" },
      ],
    });
    expect(result).toBe("Base & Extra");
  });

  it("resolves oneOf in property type", () => {
    const result = resolveType({
      oneOf: [
        { $ref: "#/components/schemas/A" },
        { $ref: "#/components/schemas/B" },
      ],
    });
    expect(result).toBe("A | B");
  });
});

describe("refToName", () => {
  it("extracts the last segment from a $ref", () => {
    expect(refToName("#/components/schemas/Foo")).toBe("Foo");
  });

  it("handles deeply nested refs", () => {
    expect(refToName("#/a/b/c/d/MyType")).toBe("MyType");
  });

  it("sanitizes dot-notation schema names", () => {
    expect(refToName("#/components/schemas/billing.alert")).toBe("billing__alert");
  });

  it("sanitizes multi-dot schema names", () => {
    expect(refToName("#/components/schemas/account.application.authorized")).toBe("account__application__authorized");
  });
});

describe("sanitizeTypeName", () => {
  it("replaces dots with double underscores", () => {
    expect(sanitizeTypeName("billing.alert")).toBe("billing__alert");
  });

  it("handles multiple dots", () => {
    expect(sanitizeTypeName("account.application.authorized")).toBe("account__application__authorized");
  });

  it("leaves clean names unchanged", () => {
    expect(sanitizeTypeName("payment_intent")).toBe("payment_intent");
  });

  it("handles names with mixed problematic characters", () => {
    expect(sanitizeTypeName("foo.bar-baz")).toBe("foo__bar_baz");
  });

  it("avoids collisions between dot and underscore variants", () => {
    expect(sanitizeTypeName("billing.alert_triggered")).not.toBe(
      sanitizeTypeName("billing.alert.triggered"),
    );
  });
});

describe("schemaToTsType", () => {
  it("maps integer to number", () => {
    expect(schemaToTsType({ type: "integer" })).toBe("number");
  });

  it("maps number to number", () => {
    expect(schemaToTsType({ type: "number" })).toBe("number");
  });

  it("maps boolean to boolean", () => {
    expect(schemaToTsType({ type: "boolean" })).toBe("boolean");
  });

  it("maps string to string", () => {
    expect(schemaToTsType({ type: "string" })).toBe("string");
  });

  it("maps $ref to type name", () => {
    expect(schemaToTsType({ $ref: "#/components/schemas/Widget" })).toBe(
      "Widget",
    );
  });

  it("returns unknown for unrecognized", () => {
    expect(schemaToTsType({ type: "array" })).toBe("unknown");
  });
});

describe("sanitizeVar", () => {
  it("replaces non-alphanumeric chars with underscores", () => {
    expect(sanitizeVar("foo-bar")).toBe("foo_bar");
  });

  it("replaces dots and spaces", () => {
    expect(sanitizeVar("foo.bar baz")).toBe("foo_bar_baz");
  });

  it("keeps alphanumeric chars unchanged", () => {
    expect(sanitizeVar("fooBar123")).toBe("fooBar123");
  });
});

describe("capitalize", () => {
  it("capitalizes the first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("handles single char", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("does not change already capitalized", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("resolveSchemaProps", () => {
  it("returns empty array for undefined schema", () => {
    expect(resolveSchemaProps(undefined, {})).toEqual([]);
  });

  it("returns empty array for schema without properties", () => {
    expect(resolveSchemaProps({ type: "object" }, {})).toEqual([]);
  });

  it("resolves basic properties", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("name");
    expect(result[0].type).toBe("string");
    expect(result[0].cliFlag).toBe("name");
    expect(result[0].camelName).toBe("name");
    expect(result[1].name).toBe("age");
    expect(result[1].type).toBe("number");
  });

  it("converts camelCase property names to kebab-case CLI flags", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result[0].cliFlag).toBe("first-name");
    expect(result[1].cliFlag).toBe("last-name");
  });

  it("resolves $ref schemas", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Widget: {
        type: "object",
        properties: {
          color: { type: "string" },
        },
      },
    };
    const schema: OpenApiSchema = {
      $ref: "#/components/schemas/Widget",
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("color");
  });

  it("merges allOf properties", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Base: {
        type: "object",
        properties: {
          id: { type: "integer" },
        },
      },
      Extra: {
        type: "object",
        properties: {
          label: { type: "string" },
        },
      },
    };
    const schema: OpenApiSchema = {
      allOf: [
        { $ref: "#/components/schemas/Base" },
        { $ref: "#/components/schemas/Extra" },
      ],
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual(["id", "label"]);
  });

  it("deduplicates allOf properties by name", () => {
    const schemas: Record<string, OpenApiSchema> = {
      Base: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
        },
      },
    };
    const schema: OpenApiSchema = {
      allOf: [
        { $ref: "#/components/schemas/Base" },
        {
          type: "object",
          properties: {
            name: { type: "string" },
            extra: { type: "boolean" },
          },
        },
      ],
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.name)).toEqual(["id", "name", "extra"]);
  });

  it("resolves oneOf variants with variant tags", () => {
    const schemas: Record<string, OpenApiSchema> = {
      TypeA: {
        type: "object",
        properties: {
          fieldA: { type: "string" },
        },
      },
      TypeB: {
        type: "object",
        properties: {
          fieldB: { type: "number" },
        },
      },
    };
    const schema: OpenApiSchema = {
      oneOf: [
        { $ref: "#/components/schemas/TypeA" },
        { $ref: "#/components/schemas/TypeB" },
      ],
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("fieldA");
    expect(result[0].variant).toBe("TypeA");
    expect(result[1].name).toBe("fieldB");
    expect(result[1].variant).toBe("TypeB");
  });

  it("resolves single-variant oneOf without variant tags", () => {
    const schemas: Record<string, OpenApiSchema> = {
      OnlyType: {
        type: "object",
        properties: {
          field: { type: "string" },
        },
      },
    };
    const schema: OpenApiSchema = {
      oneOf: [{ $ref: "#/components/schemas/OnlyType" }],
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("field");
    expect(result[0].variant).toBeUndefined();
  });

  it("resolves enum values from direct enum", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result[0].enumValues).toEqual(["ACTIVE", "INACTIVE"]);
  });

  it("resolves enum values from $ref", () => {
    const schemas: Record<string, OpenApiSchema> = {
      StatusEnum: { type: "string", enum: ["OPEN", "CLOSED"] },
    };
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        status: { $ref: "#/components/schemas/StatusEnum" },
      },
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result[0].enumValues).toEqual(["OPEN", "CLOSED"]);
  });

  it("unwraps array items", () => {
    const schema: OpenApiSchema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("name");
  });

  it("skips readOnly properties", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        id: { type: "integer", readOnly: true },
        name: { type: "string" },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("name");
  });

  it("tracks required properties", () => {
    const schema: OpenApiSchema = {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        optional: { type: "string" },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result[0].required).toBe(true);
    expect(result[1].required).toBe(false);
  });

  it("includes description, format, default, deprecated from property schema", () => {
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "User email",
          format: "email",
          default: "test@example.com",
          deprecated: true,
        },
      },
    };
    const result = resolveSchemaProps(schema, {});
    expect(result[0].description).toBe("User email");
    expect(result[0].format).toBe("email");
    expect(result[0].default).toBe("test@example.com");
    expect(result[0].deprecated).toBe(true);
  });

  it("inherits description from $ref schema", () => {
    const schemas: Record<string, OpenApiSchema> = {
      StatusEnum: {
        type: "string",
        enum: ["ACTIVE", "INACTIVE"],
        description: "Status of the resource",
      },
    };
    const schema: OpenApiSchema = {
      type: "object",
      properties: {
        status: { $ref: "#/components/schemas/StatusEnum" },
      },
    };
    const result = resolveSchemaProps(schema, schemas);
    expect(result[0].description).toBe("Status of the resource");
  });
});
