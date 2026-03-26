export interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  $ref?: string;
  enum?: string[];
  nullable?: boolean;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
}

export interface OpenApiOperation {
  tags?: string[];
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: "path" | "query" | "header";
    required?: boolean;
    schema: OpenApiSchema;
  }>;
  requestBody?: {
    content?: Record<string, { schema: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    { content?: Record<string, { schema: OpenApiSchema }> }
  >;
}

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch";

export const HTTP_METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
];

export interface BodyProp {
  name: string;
  type: string;
  cliFlag: string; // kebab-case for CLI, e.g. "first-name"
  camelName: string; // camelCase for Commander opts, e.g. "firstName"
  enumValues?: string[];
  variant?: string; // which discriminator variant this belongs to (undefined = common/base)
}

export interface CommandDef {
  verb: string;
  operationId: string;
  pathParams: Array<{ name: string; type: string }>;
  queryParams: Array<{
    name: string;
    type: string;
    enumValues?: string[];
  }>;
  hasBody: boolean;
  bodyIsArray: boolean;
  bodyProps: BodyProp[];
  bodyPrimitiveType?:
    | "string"
    | "number"
    | "boolean"
    | "string[]"
    | "number[]";
  description: string;
}
