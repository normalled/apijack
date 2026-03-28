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
    const installResult = await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir,
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });
    expect(installResult.success).toBe(true);

    // Verify marketplace
    const marketplacePath = join(
      testClaudeDir, "plugins", "marketplaces", "local", ".claude-plugin", "marketplace.json"
    );
    const marketplace = readJson(marketplacePath);
    expect(marketplace.plugins.find((p: any) => p.name === "apijack")).toBeDefined();

    // Verify installed
    const installed = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installed.plugins["apijack@local"]).toBeDefined();

    // Verify user data
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
    expect(existsSync(join(testDataDir, "plugin.json"))).toBe(true);

    // Uninstall
    const uninstallResult = await uninstallPlugin({ claudeDir: testClaudeDir });
    expect(uninstallResult.success).toBe(true);

    // Verify user data preserved
    expect(existsSync(testDataDir)).toBe(true);
    expect(existsSync(join(testDataDir, "routines"))).toBe(true);
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

    const installed = readJson(join(testClaudeDir, "plugins", "installed_plugins.json"));
    expect(installed.plugins["apijack@local"][0].version).toBe("0.2.0");
  });
});
