import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { installPlugin } from "../../src/plugin/install";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testRoot = join(tmpdir(), "apijack-plugin-test-" + Date.now());
const testClaudeDir = join(testRoot, ".claude");
const testDataDir = join(testRoot, ".apijack");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("installPlugin()", () => {
  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  test("creates plugin cache directory with expected files", async () => {
    const result = await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    expect(result.success).toBe(true);

    const cacheDir = join(testClaudeDir, "plugins", "cache", "local", "apijack", "0.1.0");
    expect(existsSync(join(cacheDir, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(existsSync(join(cacheDir, "skills", "apijack", "SKILL.md"))).toBe(true);
  });

  test("registers in installed_plugins.json", async () => {
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    const installed = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installed.plugins["apijack@local"]).toBeDefined();
    expect(installed.plugins["apijack@local"][0].version).toBe("0.1.0");
    expect(installed.plugins["apijack@local"][0].scope).toBe("user");
  });

  test("enables in settings.json", async () => {
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    const settings = readJson(join(testClaudeDir, "settings.json"));
    expect(settings.enabledPlugins["apijack@local"]).toBe(true);
  });

  test("creates user data directory", async () => {
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    expect(existsSync(testDataDir)).toBe(true);
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
  });

  test("writes plugin.json with cliInvocation to user data dir", async () => {
    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    const pluginConfig = readJson(join(testDataDir, "plugin.json"));
    expect(pluginConfig.cliInvocation).toEqual(["bun", "run", "src/cli.ts"]);
    expect(pluginConfig.generatedDir).toBe("src/generated");
  });

  test("preserves existing settings.json fields", async () => {
    mkdirSync(testClaudeDir, { recursive: true });
    const settingsPath = join(testClaudeDir, "settings.json");
    await Bun.write(settingsPath, JSON.stringify({
      enabledPlugins: { "other-plugin@local": true },
      mcpServers: { existing: { type: "stdio" } },
    }));

    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    const settings = readJson(settingsPath);
    expect(settings.enabledPlugins["other-plugin@local"]).toBe(true);
    expect(settings.enabledPlugins["apijack@local"]).toBe(true);
    expect(settings.mcpServers.existing).toBeDefined();
  });
});
