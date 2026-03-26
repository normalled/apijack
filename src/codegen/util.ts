import type { OpenApiSchema, BodyProp } from "./openapi-types";

/**
 * Resolve an OpenAPI schema to a TypeScript type string.
 * Handles $ref, arrays, primitives, enums, objects, and nullable.
 */
export function resolveType(schema: OpenApiSchema): string {
  let base: string;

  if (schema.$ref) {
    base = refToName(schema.$ref);
  } else if (schema.type === "array" && schema.items) {
    base = `${resolveType(schema.items)}[]`;
  } else if (schema.type === "integer" || schema.type === "number") {
    base = "number";
  } else if (schema.type === "boolean") {
    base = "boolean";
  } else if (schema.type === "string") {
    if (schema.enum) {
      base = schema.enum.map((v) => `"${v}"`).join(" | ");
    } else {
      base = "string";
    }
  } else if (schema.type === "object" || schema.properties) {
    base = "Record<string, unknown>";
  } else {
    base = "unknown";
  }

  if (schema.nullable) {
    base += " | null";
  }

  return base;
}

/**
 * Extract the type name from a JSON $ref string.
 * e.g. "#/components/schemas/Foo" -> "Foo"
 */
export function refToName(ref: string): string {
  return ref.split("/").pop()!;
}

/**
 * Map an OpenAPI schema to a simple TypeScript type for use in method signatures.
 * Less detailed than resolveType — only handles top-level primitives and $ref.
 */
export function schemaToTsType(schema: OpenApiSchema): string {
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string") return "string";
  if (schema.$ref) return refToName(schema.$ref);
  return "unknown";
}

/**
 * Normalize an OpenAPI tag into an array of lowercase tokens.
 * Splits on whitespace, slashes, and colons. Strips leading/trailing hyphens.
 */
export function normalizeTag(tag: string): string[] {
  return tag
    .toLowerCase()
    .split(/[\s/:]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/**
 * Resolve an OpenAPI request body schema into a flat list of BodyProp entries
 * suitable for generating CLI flags. Handles $ref, allOf, oneOf/anyOf, and arrays.
 */
export function resolveSchemaProps(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
): BodyProp[] {
  if (!schema) return [];

  // Resolve $ref
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop()!;
    return resolveSchemaProps(schemas[name], schemas);
  }

  // Resolve allOf — merge properties from all parts
  if (schema.allOf) {
    const merged: BodyProp[] = [];
    const seen = new Set<string>();
    for (const part of schema.allOf) {
      for (const prop of resolveSchemaProps(part, schemas)) {
        if (!seen.has(prop.name) && !seen.has(prop.cliFlag)) {
          seen.add(prop.name);
          seen.add(prop.cliFlag);
          merged.push(prop);
        }
      }
    }
    return merged;
  }

  // Resolve oneOf/anyOf — collect all variant properties tagged with variant name
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf)!;
    if (variants.length === 1) {
      return resolveSchemaProps(variants[0], schemas);
    }

    const all: BodyProp[] = [];
    const seen = new Set<string>();

    for (const v of variants) {
      const variantName = v.$ref ? v.$ref.split("/").pop()! : undefined;
      const props = resolveSchemaProps(v, schemas);
      for (const prop of props) {
        if (!seen.has(prop.cliFlag)) {
          seen.add(prop.cliFlag);
          all.push({ ...prop, variant: variantName });
        }
      }
    }
    return all;
  }

  // Unwrap arrays — expose the item properties
  if (schema.type === "array" && schema.items) {
    return resolveSchemaProps(schema.items, schemas);
  }

  if (!schema.properties) return [];

  const results: BodyProp[] = [];
  const seenFlags = new Set<string>();
  for (const [name, prop] of Object.entries(schema.properties)) {
    const flag = name
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "");
    if (seenFlags.has(flag)) continue; // Skip duplicate CLI flags
    seenFlags.add(flag);

    // Resolve enum values — direct or via $ref
    let enumValues: string[] | undefined;
    if (prop.enum) {
      enumValues = prop.enum;
    } else if (prop.$ref) {
      const refName = prop.$ref.split("/").pop()!;
      const refSchema = schemas[refName];
      if (refSchema?.enum) enumValues = refSchema.enum;
    }

    results.push({
      name,
      type: schemaToTsType(prop),
      cliFlag: flag,
      camelName: name,
      enumValues,
    });
  }
  return results;
}

/**
 * Replace non-alphanumeric characters with underscores for safe variable names.
 */
export function sanitizeVar(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Capitalize the first character of a string.
 */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
