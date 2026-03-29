import { describe, test, expect } from "bun:test";
import { configListAction } from "./list";

describe("configListAction", () => {
  test("returns environment list", async () => {
    const envs = [
      { name: "local", url: "http://localhost:8080", user: "admin", active: true },
      { name: "staging", url: "https://staging.example.com", user: "user", active: false },
    ];
    const result = await configListAction({
      listEnvs: async () => envs,
    });
    expect(result).toEqual(envs);
  });

  test("returns empty array when no environments", async () => {
    const result = await configListAction({
      listEnvs: async () => [],
    });
    expect(result).toEqual([]);
  });
});
