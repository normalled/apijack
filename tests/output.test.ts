import { describe, expect, test } from "bun:test";
import { formatOutput } from "../src/output";

describe("formatOutput", () => {
  const sampleData = [
    { id: 1, name: "Alice", role: "admin" },
    { id: 2, name: "Bob", role: "user" },
  ];

  test("json mode returns pretty-printed JSON", () => {
    const result = formatOutput(sampleData, "json");
    expect(result).toBe(JSON.stringify(sampleData, null, 2));
  });

  test("table mode returns cli-table3 table for array of objects", () => {
    const result = formatOutput(sampleData, "table");
    // Table should contain the header keys and row values
    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("role");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("admin");
    expect(result).toContain("user");
    // Should not be JSON (tables use box-drawing characters)
    expect(result).toContain("─");
  });

  test("table mode falls back to JSON for non-array data", () => {
    const obj = { id: 1, name: "Alice" };
    const result = formatOutput(obj, "table");
    expect(result).toBe(JSON.stringify(obj, null, 2));
  });

  test("quiet mode returns empty string", () => {
    const result = formatOutput(sampleData, "quiet");
    expect(result).toBe("");
  });
});
