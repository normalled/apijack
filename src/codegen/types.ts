import type { OpenApiSchema } from "./openapi-types";
import { resolveType, refToName } from "./util";

/**
 * Generate TypeScript type definitions from OpenAPI component schemas.
 * Produces interfaces for object schemas, union types for enums,
 * intersection types for allOf, and union types for oneOf/anyOf.
 */
export function generateTypes(
  schemas: Record<string, OpenApiSchema>,
): string {
  const lines: string[] = ["// Auto-generated — do not edit", ""];

  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.enum) {
      lines.push(
        `export type ${name} = ${schema.enum.map((v) => `"${v}"`).join(" | ")};`,
      );
    } else if (schema.type === "object" || schema.properties) {
      lines.push(`export interface ${name} {`);
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(
          schema.properties,
        )) {
          const tsType = resolveType(propSchema);
          lines.push(`  ${propName}?: ${tsType};`);
        }
      }
      lines.push("}");
    } else if (schema.allOf) {
      const parts = schema.allOf.map((s) =>
        s.$ref ? refToName(s.$ref) : "unknown",
      );
      lines.push(`export type ${name} = ${parts.join(" & ")};`);
    } else if (schema.oneOf || schema.anyOf) {
      const variants = (schema.oneOf || schema.anyOf)!;
      const parts = variants.map((s) =>
        s.$ref ? refToName(s.$ref) : "unknown",
      );
      lines.push(`export type ${name} = ${parts.join(" | ")};`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
