import { describe, test, expect, mock } from "bun:test";
import { generateAction } from "./generate";

describe("generateAction", () => {
  test("calls fetchAndGenerate with correct params", async () => {
    const fetchAndGen = mock(() => Promise.resolve());
    await generateAction({
      env: { url: "http://localhost:8080", user: "admin", password: "secret" },
      specPath: "/v3/api-docs",
      outDir: "/tmp/generated",
      fetchAndGenerate: fetchAndGen,
    });

    expect(fetchAndGen).toHaveBeenCalledWith({
      baseUrl: "http://localhost:8080",
      specPath: "/v3/api-docs",
      outDir: "/tmp/generated",
      auth: { username: "admin", password: "secret" },
    });
  });

  test("throws when no active environment", () => {
    expect(generateAction({
      env: null,
      specPath: "/v3/api-docs",
      outDir: "/tmp/generated",
      fetchAndGenerate: mock(() => Promise.resolve()),
    })).rejects.toThrow("No active environment");
  });
});
