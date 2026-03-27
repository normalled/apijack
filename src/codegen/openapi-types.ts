export interface OpenApiSchema {
  // Structure
  type?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  $ref?: string;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  additionalProperties?: boolean | OpenApiSchema;

  // Enum + nullable
  enum?: string[];
  nullable?: boolean;

  // Metadata
  description?: string;
  title?: string;
  format?: string;
  example?: unknown;
  default?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  // Constraints
  required?: string[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Polymorphism
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
}

export interface OpenApiOperation {
  tags?: string[];
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  parameters?: Array<{
    name: string;
    in: "path" | "query" | "header";
    required?: boolean;
    description?: string;
    schema: OpenApiSchema;
    deprecated?: boolean;
    example?: unknown;
  }>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: Record<string, { schema: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema: OpenApiSchema }>;
    }
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
  description?: string;
  required?: boolean;
  format?: string;
  default?: unknown;
  deprecated?: boolean;
  readOnly?: boolean;
}

export interface CommandDef {
  verb: string;
  operationId: string;
  pathParams: Array<{ name: string; type: string; description?: string }>;
  queryParams: Array<{
    name: string;
    type: string;
    enumValues?: string[];
    description?: string;
    default?: unknown;
    format?: string;
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
  summary?: string;
  deprecated?: boolean;
}
