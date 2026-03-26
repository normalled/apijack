import type { OpenApiOperation } from "./openapi-types";
import { HTTP_METHODS } from "./openapi-types";
import { schemaToTsType, refToName } from "./util";

/**
 * Generate an ApiClient class from OpenAPI paths.
 * The class has a HeadersProvider, a private request() method,
 * and one method per operationId.
 */
export function generateClient(
  paths: Record<string, Record<string, OpenApiOperation>>,
): string {
  const lines: string[] = [
    "// Auto-generated — do not edit",
    "",
    "export type HeadersProvider = () => Record<string, string>;",
    "",
    "export class ApiClient {",
    "  constructor(private baseUrl: string, private getHeaders: HeadersProvider) {}",
    "",
    "  private async request(method: string, path: string, opts?: { params?: Record<string, unknown>; body?: unknown }): Promise<unknown> {",
    "    const url = new URL(path, this.baseUrl);",
    "    if (opts?.params) {",
    "      for (const [k, v] of Object.entries(opts.params)) {",
    "        if (v !== undefined) url.searchParams.set(k, String(v));",
    "      }",
    "    }",
    "    const headers: Record<string, string> = {",
    '      ...this.getHeaders(),',
    '      "Content-Type": "application/json",',
    "    };",
    "    const res = await fetch(url.toString(), {",
    "      method,",
    "      headers,",
    "      body: opts?.body ? JSON.stringify(opts.body) : undefined,",
    "    });",
    "    if (!res.ok) {",
    "      const text = await res.text();",
    "      throw { status: res.status, body: text };",
    "    }",
    "    const text = await res.text();",
    "    if (!text) return undefined;",
    "    return JSON.parse(text);",
    "  }",
    "",
  ];

  for (const [path, methods] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method] as OpenApiOperation | undefined;
      if (!op || !op.operationId) continue;

      const pathParams = (op.parameters || []).filter((p) => p.in === "path");
      const queryParams = (op.parameters || []).filter(
        (p) => p.in === "query",
      );

      const args: string[] = [];
      for (const p of pathParams) {
        args.push(`${p.name}: ${schemaToTsType(p.schema)}`);
      }

      const bodySchema =
        op.requestBody?.content?.["application/json"]?.schema;
      if (bodySchema) {
        const bodyType = bodySchema.$ref
          ? refToName(bodySchema.$ref)
          : "unknown";
        args.push(`body: ${bodyType}`);
      }

      if (queryParams.length > 0) {
        const qFields = queryParams
          .map((p) => `${p.name}?: ${schemaToTsType(p.schema)}`)
          .join("; ");
        args.push(`params?: { ${qFields} }`);
      }

      const pathTemplate =
        pathParams.length > 0
          ? `\`${path.replace(/\{(\w+)\}/g, "${$1}")}\``
          : `"${path}"`;

      const reqOpts: string[] = [];
      if (queryParams.length > 0) reqOpts.push("params");
      if (bodySchema) reqOpts.push("body");
      const optsArg =
        reqOpts.length > 0 ? `, { ${reqOpts.join(", ")} }` : "";

      lines.push(
        `  async ${op.operationId}(${args.join(", ")}): Promise<unknown> {`,
      );
      lines.push(
        `    return this.request("${method.toUpperCase()}", ${pathTemplate}${optsArg});`,
      );
      lines.push("  }");
      lines.push("");
    }
  }

  lines.push("}");
  return lines.join("\n");
}
