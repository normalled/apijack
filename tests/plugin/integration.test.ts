import { describe, test, expect, afterEach } from "bun:test";
import { installPlugin } from "../../src/plugin/install";
import { uninstallPlugin } from "../../src/plugin/uninstall";
import { rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testRoot = join(tmpdir(), "apijack-integration-" + Date.now());
const testClaudeDir = join(testRoot, ".claude");
const testDataDir = join(testRoot, ".apijack");
const sourceDir = join(import.meta.dir, "../..");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("plugin install → uninstall roundtrip", () => {
  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test("full lifecycle: install, verify, uninstall, verify preservation", async () => {
    // Install
    const installResult = await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir,
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });
    expect(installResult.success).toBe(true);

    // Verify all files are in place
    const cacheDir = installResult.pluginCacheDir;
    expect(existsSync(join(cacheDir, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(existsSync(join(cacheDir, "skills", "apijack", "SKILL.md"))).toBe(true);

    // Verify registrations
    const installed = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installed.plugins["apijack@local"]).toHaveLength(1);

    const settings = readJson(join(testClaudeDir, "settings.json"));
    expect(settings.enabledPlugins["apijack@local"]).toBe(true);

    // Verify user data
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
    expect(existsSync(join(testDataDir, "plugin.json"))).toBe(true);

    // Uninstall
    const uninstallResult = await uninstallPlugin({ claudeDir: testClaudeDir });
    expect(uninstallResult.success).toBe(true);

    // Verify plugin removed
    expect(existsSync(join(testClaudeDir, "plugins", "cache", "local", "apijack"))).toBe(false);

    const installedAfter = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installedAfter.plugins["apijack@local"]).toBeUndefined();

    const settingsAfter = readJson(join(testClaudeDir, "settings.json"));
    expect(settingsAfter.enabledPlugins["apijack@local"]).toBeUndefined();

    // Verify user data preserved
    expect(existsSync(testDataDir)).toBe(true);
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
    expect(existsSync(join(testDataDir, "plugin.json"))).toBe(true);
  });

  test("reinstall after uninstall works cleanly", async () => {
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir,
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    await uninstallPlugin({ claudeDir: testClaudeDir });

    const result = await installPlugin({
      version: "0.2.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir,
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    expect(result.success).toBe(true);
    expect(result.pluginCacheDir).toContain("0.2.0");

    const installed = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installed.plugins["apijack@local"][0].version).toBe("0.2.0");
  });
});
