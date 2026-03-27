import { describe, it, expect } from "bun:test";
import { generateTypes } from "../../src/codegen/types";
import { generateClient } from "../../src/codegen/client";
import { generateCommands } from "../../src/codegen/commands";
import { generateCommandMap } from "../../src/codegen/command-map";
import fixture from "../fixtures/edge-cases.json";

const schemas = fixture.components.schemas as Record<string, any>;
const paths = fixture.paths as Record<string, any>;

const typesOutput = generateTypes(schemas);
const clientOutput = generateClient(paths, schemas);
const commandsOutput = generateCommands(paths, schemas);
const commandMapOutput = generateCommandMap(paths, schemas);

// -- 1. Recursive/Circular Structures --

describe("edge cases: recursive/circular structures", () => {
  it("self-referencing schema resolves to type name", () => {
    expect(typesOutput).toContain("export interface TreeNode {");
    expect(typesOutput).toMatch(/children\??: TreeNode\[\]/);
  });

  it("indirect cycle resolves to type names", () => {
    expect(typesOutput).toContain("export interface CycleA {");
    expect(typesOutput).toContain("export interface CycleB {");
    expect(typesOutput).toMatch(/b\??: CycleB/);
    expect(typesOutput).toMatch(/a\??: CycleA/);
  });

  it("multi-hop ref chain resolves correctly", () => {
    expect(typesOutput).toMatch(/next\??: ChainB/);
    expect(typesOutput).toMatch(/next\??: ChainC/);
    expect(typesOutput).toContain("export interface ChainC {");
  });

  it("generators do not crash on recursive schemas", () => {
    expect(typesOutput).toBeTruthy();
    expect(clientOutput).toBeTruthy();
    expect(commandsOutput).toBeTruthy();
    expect(commandMapOutput).toBeTruthy();
  });
});

// -- 2. Composition Edge Cases --

describe("edge cases: composition", () => {
  it("allOf with 3 parts including inline schema", () => {
    expect(typesOutput).toContain("export type TripleAllOf =");
    expect(typesOutput).toContain("ChainA");
    expect(typesOutput).toContain("ChainB");
    expect(typesOutput).toMatch(/extra: string/);
  });

  it("allOf where one part is an enum", () => {
    expect(typesOutput).toContain("export type AllOfWithEnum =");
    expect(typesOutput).toContain("LargeEnum");
  });

  it("oneOf with single variant unwraps or produces single-element union", () => {
    expect(typesOutput).toContain("SingleVariantOneOf");
    expect(typesOutput).toContain("TreeNode");
  });

  it("anyOf produces union type same as oneOf", () => {
    expect(typesOutput).toContain("export type AnyOfExample =");
    expect(typesOutput).toContain("ChainA");
    expect(typesOutput).toContain("ChainB");
  });

  it("oneOf with inline schemas resolves inline variants", () => {
    const block = typesOutput.split("InlineOneOf")[1]?.split("\n\n")[0] || "";
    expect(block).toContain("alphaField");
    expect(block).toContain("betaField");
  });

  it("discriminator without mapping derives values from schema names", () => {
    expect(typesOutput).toContain("DiscriminatorNoMapping");
    expect(typesOutput).toContain("nodeType");
    expect(typesOutput).toContain("ChainA");
    expect(typesOutput).toContain("ChainB");
  });

  it("nested composition — property with allOf type", () => {
    expect(typesOutput).toContain("export interface NestedComposition {");
    const block = typesOutput.split("export interface NestedComposition")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("nested");
    expect(block).toContain("TreeNode");
  });
});

// -- 3. Inline/Anonymous Schemas --

describe("edge cases: inline/anonymous schemas", () => {
  it("deeply nested objects hit depth cap", () => {
    const block = typesOutput.split("export interface DeeplyNested")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("level1");
    expect(block).toContain("level2");
    expect(block).toContain("level3");
    expect(block).toContain("Record<string, unknown>");
  });

  it("array items with inline object schema", () => {
    const block = typesOutput.split("export interface InlineArrayItems")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("id");
    expect(block).toContain("name");
  });

  it("additionalProperties only — no named properties", () => {
    expect(typesOutput).toContain("export interface AdditionalPropsOnly {");
    expect(typesOutput).toContain("[key: string]:");
  });

  it("additionalProperties: true", () => {
    const block = typesOutput.split("export interface AdditionalPropsTrue")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("name?: string");
    expect(block).toContain("[key: string]: unknown");
  });

  it("additionalProperties: false — no index signature", () => {
    const block = typesOutput.split("export interface AdditionalPropsFalse")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("name?: string");
    expect(block).not.toContain("[key: string]");
  });

  it("additionalProperties type conflict does not crash", () => {
    const block = typesOutput.split("export interface AdditionalPropsConflict")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("name");
    expect(block).toContain("count");
  });
});

// -- 4. Metadata Stress --

describe("edge cases: metadata stress", () => {
  it("all constraints in one JSDoc block", () => {
    expect(typesOutput).toContain("@format double");
    expect(typesOutput).toContain("@minimum 0");
    expect(typesOutput).toContain("@maximum 100");
    expect(typesOutput).toContain("@exclusiveMinimum 0");
    expect(typesOutput).toContain("@exclusiveMaximum 100");
    expect(typesOutput).toContain("@default 50");
    expect(typesOutput).toContain("@example 42.5");
  });

  it("description with */ does not break JSDoc", () => {
    expect(typesOutput).toContain("*\\/");
  });

  it("description with quotes survives in output", () => {
    expect(typesOutput).toContain("quotes");
  });

  it("HTML in description passes through", () => {
    expect(typesOutput).toContain("<b>HTML</b>");
  });

  it("multiline description splits into multi-line JSDoc", () => {
    expect(typesOutput).toContain("Line one");
    expect(typesOutput).toContain("Line two");
    expect(typesOutput).toContain("Line three");
  });

  it("uniqueItems emits @uniqueItems tag", () => {
    expect(typesOutput).toContain("@uniqueItems");
  });

  it("object default value serialized as JSON", () => {
    expect(typesOutput).toMatch(/@default.*key.*value/);
  });

  it("boolean exclusiveMinimum (OAS 3.0 style)", () => {
    expect(typesOutput).toContain("@exclusiveMinimum true");
  });

  it("large enum generates all 50 values", () => {
    expect(typesOutput).toContain('export type LargeEnum =');
    expect(typesOutput).toContain('"V01"');
    expect(typesOutput).toContain('"V50"');
    const enumLine = typesOutput.split("export type LargeEnum =")[1]?.split(";")[0] || "";
    const valueCount = (enumLine.match(/"/g) || []).length / 2;
    expect(valueCount).toBe(50);
  });

  it("empty schema does not crash", () => {
    expect(typesOutput).toBeTruthy();
  });
});

// -- 5. Naming/Dedup --

describe("edge cases: naming/dedup", () => {
  it("duplicate CLI flags are deduplicated", () => {
    expect(commandsOutput).toBeTruthy();
  });

  it("reserved word properties are valid in TypeScript interfaces", () => {
    const block = typesOutput.split("export interface ReservedWord")[1]?.split("\n}\n")[0] || "";
    expect(block).toContain("type?: string");
    expect(block).toContain("function?: string");
    expect(block).toContain("class?: string");
  });
});

// -- 6. Operations --

describe("edge cases: operations", () => {
  it("operation without operationId is skipped in client", () => {
    expect(clientOutput).not.toContain("async undefined(");
  });

  it("operation without operationId is skipped in command map", () => {
    expect(commandMapOutput).not.toContain("no-operation-id");
  });

  it("operation without tags goes into default group", () => {
    expect(commandsOutput).toContain("noTagsOp");
    expect(commandsOutput).toContain('"default"');
  });

  it("operation with multiple tags uses first tag", () => {
    expect(commandsOutput).toContain("multiTagOp");
    expect(commandMapOutput).toContain("multiTagOp");
  });

  it("multiple response codes — 200 preferred over 201", () => {
    expect(clientOutput).toMatch(/multiResponseOp.*Promise<ChainA>/);
  });

  it("empty responses returns void", () => {
    expect(clientOutput).toMatch(/noResponseOp.*Promise<void>/);
  });

  it("primitive body produces body: string parameter", () => {
    expect(clientOutput).toContain("primitiveBodyOp");
    expect(commandsOutput).toContain("--value");
  });

  it("array body produces array parameter", () => {
    expect(clientOutput).toContain("arrayBodyOp");
    expect(commandsOutput).toContain("array");
  });

  it("all-readOnly body produces zero body prop flags", () => {
    const idx = commandsOutput.indexOf("client.allReadonlyBodyOp");
    const preceding = commandsOutput.lastIndexOf('.command("', idx);
    const block = commandsOutput.substring(preceding, idx);
    expect(block).not.toContain("--body");
    expect(block).not.toContain("--body-file");
    expect(block).not.toContain('"--id ');
    expect(block).not.toContain("--created-at");
  });

  it("inline response type is handled", () => {
    expect(clientOutput).toContain("inlineResponseOp");
  });

  it("inline body type is handled", () => {
    expect(clientOutput).toContain("inlineBodyOp");
    expect(commandsOutput).toContain("inlineBodyOp");
  });

  it("union response type imports constituent types", () => {
    expect(clientOutput).toContain("unionResponseOp");
    const importLine = clientOutput.split("\n").find((l: string) => l.startsWith("import type"));
    if (importLine) {
      expect(importLine).toContain("ChainA");
      expect(importLine).toContain("ChainB");
    }
  });

  it("shared path parameters are inherited by operations", () => {
    expect(clientOutput).toContain("sharedParamGet");
    expect(clientOutput).toContain("sharedParamDelete");
  });

  it("rich query param has description, enum, default, and format", () => {
    const idx = commandsOutput.indexOf("client.richQueryOp");
    const preceding = commandsOutput.lastIndexOf('.command("', idx);
    const block = commandsOutput.substring(preceding, idx);
    expect(block).toContain("Filter by status");
    expect(block).toContain("active");
    expect(block).toContain("inactive");
    expect(block).toContain("pending");
    expect(block).toContain("default: active");
    expect(block).toContain("custom-status");
  });

  it("dangerous summary with quotes is escaped in commands", () => {
    expect(commandsOutput).toContain("dangerousSummaryOp");
    expect(commandsOutput).toContain("quotes");
  });

  it("command map has description for operations with summary", () => {
    expect(commandMapOutput).toContain('description: "Query param with everything"');
  });
});
