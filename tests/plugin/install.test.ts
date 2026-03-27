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

  test("registers in local marketplace", async () => {
    const result = await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    expect(result.success).toBe(true);

    const marketplacePath = join(
      testClaudeDir,
      "plugins",
      "marketplaces",
      "local",
      ".claude-plugin",
      "marketplace.json"
    );
    expect(existsSync(marketplacePath)).toBe(true);

    const marketplace = readJson(marketplacePath);
    const plugin = marketplace.plugins.find((p: any) => p.name === "apijack");
    expect(plugin).toBeDefined();
    expect(plugin.source.source).toBe("npm");
    expect(plugin.source.package).toBe("@apijack/core");
    expect(plugin.source.version).toBe("0.1.0");
  });

  test("returns pluginCacheDir with version", async () => {
    const result = await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    expect(result.pluginCacheDir).toContain("0.1.0");
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

  test("preserves existing marketplace entries", async () => {
    // Pre-populate marketplace with another plugin
    const marketplaceDir = join(
      testClaudeDir,
      "plugins",
      "marketplaces",
      "local",
      ".claude-plugin"
    );
    mkdirSync(marketplaceDir, { recursive: true });
    const marketplacePath = join(marketplaceDir, "marketplace.json");
    await Bun.write(
      marketplacePath,
      JSON.stringify({
        $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
        name: "local",
        owner: { name: "Local Plugins" },
        plugins: [{ name: "other-plugin", description: "Other" }],
      })
    );

    await installPlugin({
      version: "0.1.0",
      claudeDir: testClaudeDir,
      userDataDir: testDataDir,
      sourceDir: join(import.meta.dir, "../.."),
      cliInvocation: ["bun", "run", "src/cli.ts"],
      generatedDir: "src/generated",
    });

    const marketplace = readJson(marketplacePath);
    expect(marketplace.plugins.find((p: any) => p.name === "other-plugin")).toBeDefined();
    expect(marketplace.plugins.find((p: any) => p.name === "apijack")).toBeDefined();
  });
});
