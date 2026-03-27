import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { installPlugin } from "../../src/plugin/install";
import { uninstallPlugin } from "../../src/plugin/uninstall";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testRoot = join(tmpdir(), "apijack-uninstall-test-" + Date.now());
const testClaudeDir = join(testRoot, ".claude");
const testDataDir = join(testRoot, ".apijack");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("uninstallPlugin()", () => {
  beforeEach(async () => {
    mkdirSync(testRoot, { recursive: true });
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test("removes from installed_plugins.json when present", async () => {
    // Set up legacy installed_plugins.json
    const installedPath = join(testClaudeDir, "plugins", "installed_plugins.json");
    mkdirSync(join(testClaudeDir, "plugins"), { recursive: true });
    writeFileSync(
      installedPath,
      JSON.stringify({ plugins: { "apijack@local": [{ version: "0.1.0", scope: "user" }] } })
    );

    await uninstallPlugin({ claudeDir: testClaudeDir });

    const installed = readJson(installedPath);
    expect(installed.plugins["apijack@local"]).toBeUndefined();
  });

  test("removes from enabledPlugins in settings.json when present", async () => {
    // Set up settings.json with enabledPlugins
    const settingsPath = join(testClaudeDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ enabledPlugins: { "apijack@local": true } })
    );

    await uninstallPlugin({ claudeDir: testClaudeDir });

    const settings = readJson(settingsPath);
    expect(settings.enabledPlugins["apijack@local"]).toBeUndefined();
  });

  test("removes plugin cache directory when present", async () => {
    // Set up cache directory
    const cacheDir = join(testClaudeDir, "plugins", "cache", "local", "apijack");
    mkdirSync(cacheDir, { recursive: true });
    expect(existsSync(cacheDir)).toBe(true);

    await uninstallPlugin({ claudeDir: testClaudeDir });

    expect(existsSync(cacheDir)).toBe(false);
  });

  test("preserves user data directory", async () => {
    await uninstallPlugin({ claudeDir: testClaudeDir });

    expect(existsSync(testDataDir)).toBe(true);
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
  });

  test("handles already-uninstalled gracefully", async () => {
    await uninstallPlugin({ claudeDir: testClaudeDir });
    const result = await uninstallPlugin({ claudeDir: testClaudeDir });
    expect(result.success).toBe(true);
  });
});
