import { describe, test, expect, mock } from "bun:test";
import { configUpdatePasswordAction } from "./update-password";

describe("configUpdatePasswordAction", () => {
  test("updates password for named environment", async () => {
    const saveFn = mock(() => Promise.resolve());
    const result = await configUpdatePasswordAction({
      envName: "local",
      password: "newpass",
      loadConfig: async () => ({
        active: "local",
        environments: {
          local: { url: "http://localhost:8080", user: "admin", password: "old" },
        },
      }),
      save: saveFn,
      cliName: "testcli",
      saveOpts: {},
    });

    expect(result.ok).toBe(true);
    expect(result.envName).toBe("local");
    expect(saveFn).toHaveBeenCalled();
  });

  test("defaults to active environment when no name given", async () => {
    const saveFn = mock(() => Promise.resolve());
    const result = await configUpdatePasswordAction({
      password: "newpass",
      loadConfig: async () => ({
        active: "staging",
        environments: {
          staging: { url: "https://staging.example.com", user: "admin", password: "old" },
        },
      }),
      save: saveFn,
      cliName: "testcli",
      saveOpts: {},
    });

    expect(result.envName).toBe("staging");
  });

  test("throws when no environments configured", () => {
    expect(configUpdatePasswordAction({
      password: "newpass",
      loadConfig: async () => null,
      save: mock(() => Promise.resolve()),
      cliName: "testcli",
      saveOpts: {},
    })).rejects.toThrow("No environments configured");
  });

  test("throws when named environment not found", () => {
    expect(configUpdatePasswordAction({
      envName: "nonexistent",
      password: "newpass",
      loadConfig: async () => ({
        active: "local",
        environments: { local: { url: "http://localhost:8080", user: "admin", password: "old" } },
      }),
      save: mock(() => Promise.resolve()),
      cliName: "testcli",
      saveOpts: {},
    })).rejects.toThrow("not found");
  });
});
