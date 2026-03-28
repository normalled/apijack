import { describe, test, expect } from "bun:test";
import { getPluginPaths } from "../../src/plugin/paths";
import { homedir } from "os";
import { join } from "path";

describe("getPluginPaths()", () => {
  const paths = getPluginPaths("0.1.0");

  test("claudeDir points to ~/.claude", () => {
    expect(paths.claudeDir).toBe(join(homedir(), ".claude"));
  });

  test("installedPluginsFile points to installed_plugins.json", () => {
    expect(paths.installedPluginsFile).toBe(
      join(homedir(), ".claude", "plugins", "installed_plugins.json"),
    );
  });

  test("settingsFile points to settings.json", () => {
    expect(paths.settingsFile).toBe(
      join(homedir(), ".claude", "settings.json"),
    );
  });

  test("userDataDir points to ~/.apijack", () => {
    expect(paths.userDataDir).toBe(join(homedir(), ".apijack"));
  });

  test("sourceDir points to project root", () => {
    expect(paths.sourceDir).toContain("apijack");
  });
});
