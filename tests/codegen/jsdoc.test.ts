import { describe, it, expect } from "bun:test";
import { buildJsDoc } from "../../src/codegen/util";

describe("buildJsDoc", () => {
  it("returns empty array when no metadata", () => {
    expect(buildJsDoc({})).toEqual([]);
  });

  it("returns empty array for schema with only type", () => {
    expect(buildJsDoc({ type: "string" })).toEqual([]);
  });

  it("single-line JSDoc for description only", () => {
    const result = buildJsDoc({ description: "A simple description" });
    expect(result).toEqual(["/** A simple description */"]);
  });

  it("multi-line JSDoc for description + tags", () => {
    const result = buildJsDoc({
      description: "Quality score",
      minimum: 0,
      maximum: 100,
      default: 50,
    });
    expect(result).toEqual([
      "/** Quality score",
      " * @minimum 0",
      " * @maximum 100",
      " * @default 50 */",
    ]);
  });

  it("includes @format tag", () => {
    const result = buildJsDoc({ description: "Creation date", format: "date-time" });
    expect(result).toEqual([
      "/** Creation date",
      " * @format date-time */",
    ]);
  });

  it("includes @example tag with string value", () => {
    const result = buildJsDoc({ description: "Code format", example: "XY9876" });
    expect(result).toEqual([
      "/** Code format",
      ' * @example "XY9876" */',
    ]);
  });

  it("includes @example tag with object value as JSON", () => {
    const result = buildJsDoc({ example: { key: "val" } });
    expect(result).toEqual([
      '/** @example {"key":"val"} */',
    ]);
  });

  it("includes @pattern tag", () => {
    const result = buildJsDoc({ pattern: "^[A-Z]{2}\\d{4}$" });
    expect(result).toEqual(['/** @pattern ^[A-Z]{2}\\d{4}$ */']);
  });

  it("includes string constraint tags", () => {
    const result = buildJsDoc({ description: "Name", minLength: 1, maxLength: 255 });
    expect(result).toEqual([
      "/** Name",
      " * @minLength 1",
      " * @maxLength 255 */",
    ]);
  });

  it("includes array constraint tags", () => {
    const result = buildJsDoc({ description: "Tags", minItems: 0, maxItems: 10 });
    expect(result).toEqual([
      "/** Tags",
      " * @minItems 0",
      " * @maxItems 10 */",
    ]);
  });

  it("includes @uniqueItems when true", () => {
    const result = buildJsDoc({ uniqueItems: true });
    expect(result).toEqual(["/** @uniqueItems */"]);
  });

  it("includes @readonly tag", () => {
    const result = buildJsDoc({ description: "Server-assigned ID", readOnly: true });
    expect(result).toEqual([
      "/** Server-assigned ID",
      " * @readonly */",
    ]);
  });

  it("includes @writeonly tag", () => {
    const result = buildJsDoc({ description: "Password", writeOnly: true });
    expect(result).toEqual([
      "/** Password",
      " * @writeonly */",
    ]);
  });

  it("includes @deprecated tag", () => {
    const result = buildJsDoc({ description: "Use newField", deprecated: true });
    expect(result).toEqual([
      "/** @deprecated Use newField */",
    ]);
  });

  it("deprecated with no description", () => {
    const result = buildJsDoc({ deprecated: true });
    expect(result).toEqual(["/** @deprecated */"]);
  });

  it("includes @exclusiveMinimum and @exclusiveMaximum", () => {
    const result = buildJsDoc({ exclusiveMinimum: 0, exclusiveMaximum: 100 });
    expect(result).toEqual([
      "/** @exclusiveMinimum 0",
      " * @exclusiveMaximum 100 */",
    ]);
  });

  it("applies indent to all lines", () => {
    const result = buildJsDoc({ description: "Score", minimum: 0 }, "  ");
    expect(result).toEqual([
      "  /** Score",
      "   * @minimum 0 */",
    ]);
  });

  it("escapes */ in descriptions", () => {
    const result = buildJsDoc({ description: "Use a/* or b*/ for wildcards" });
    expect(result).toEqual(["/** Use a/* or b*\\/ for wildcards */"]);
  });

  it("handles multi-line descriptions", () => {
    const result = buildJsDoc({ description: "Line one\nLine two" });
    expect(result).toEqual([
      "/** Line one",
      " * Line two */",
    ]);
  });

  it("all tags together", () => {
    const result = buildJsDoc({
      description: "Quality score",
      format: "double",
      minimum: 0,
      maximum: 100,
      default: 50,
      example: 75.5,
      readOnly: true,
    });
    expect(result).toEqual([
      "/** Quality score",
      " * @format double",
      " * @minimum 0",
      " * @maximum 100",
      " * @default 50",
      " * @example 75.5",
      " * @readonly */",
    ]);
  });
});
