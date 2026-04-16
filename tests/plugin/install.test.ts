import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { installPlugin } from '../../src/plugin/install';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-plugin-test-' + Date.now());
const testClaudeDir = join(testRoot, '.claude');
const testDataDir = join(testRoot, '.apijack');

function readJson(path: string): any {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

function makeOpts(overrides?: Record<string, unknown>) {
    return {
        version: '0.1.0',
        claudeDir: testClaudeDir,
        userDataDir: testDataDir,
        sourceDir: join(import.meta.dir, '../..'),
        cliInvocation: ['bun', 'run', 'src/cli.ts'],
        generatedDir: 'src/generated',
        ...overrides,
    };
}

describe('installPlugin()', () => {
    beforeEach(() => {
        mkdirSync(testRoot, { recursive: true });
    });

    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('registers in local marketplace', async () => {
        const result = await installPlugin(makeOpts());
        expect(result.success).toBe(true);

        const marketplacePath = join(
            testClaudeDir, 'plugins', 'marketplaces', 'local', '.claude-plugin', 'marketplace.json',
        );
        expect(existsSync(marketplacePath)).toBe(true);

        const marketplace = readJson(marketplacePath);
        const plugin = marketplace.plugins.find((p: any) => p.name === 'apijack');
        expect(plugin).toBeDefined();
        expect(plugin.source).toBe('./apijack');
    });

    test('returns plugin dir inside local marketplace', async () => {
        const result = await installPlugin(makeOpts());
        expect(result.marketplaceDir).toContain(join('marketplaces', 'local', 'apijack'));
    });

    test('copies skills to plugin dir', async () => {
        const result = await installPlugin(makeOpts());
        expect(existsSync(join(result.marketplaceDir, 'skills', 'write-routine', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(result.marketplaceDir, 'skills', 'setup-api', 'SKILL.md'))).toBe(true);
    });

    test('writes .mcp.json with CLAUDE_PLUGIN_ROOT', async () => {
        const result = await installPlugin(makeOpts());
        const mcpJson = readJson(join(result.marketplaceDir, '.mcp.json'));
        expect(mcpJson.mcpServers.apijack.args).toContain('${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.bundle.js');
    });

    test('creates user data directory', async () => {
        await installPlugin(makeOpts());
        expect(existsSync(testDataDir)).toBe(true);
        expect(existsSync(join(testDataDir, 'routines'))).toBe(true);
    });

    test('writes plugin.json with cliInvocation to user data dir', async () => {
        await installPlugin(makeOpts());
        const pluginConfig = readJson(join(testDataDir, 'plugin.json'));
        expect(pluginConfig.cliInvocation).toEqual(['bun', 'run', 'src/cli.ts']);
        expect(pluginConfig.generatedDir).toBe('src/generated');
    });

    test('registers in installed_plugins.json and settings.json', async () => {
        await installPlugin(makeOpts());

        const installed = readJson(join(testClaudeDir, 'plugins', 'installed_plugins.json'));
        expect(installed.plugins['apijack@local']).toBeDefined();
        expect(installed.plugins['apijack@local'][0].version).toBe('0.1.0');

        const settings = readJson(join(testClaudeDir, 'settings.json'));
        expect(settings.enabledPlugins['apijack@local']).toBe(true);
    });

    test('preserves other plugins in local marketplace', async () => {
        const localDir = join(testClaudeDir, 'plugins', 'marketplaces', 'local', '.claude-plugin');
        mkdirSync(localDir, { recursive: true });
        await Bun.write(
            join(localDir, 'marketplace.json'),
            JSON.stringify({
                name: 'local',
                owner: { name: 'Local Plugins' },
                plugins: [{ name: 'other-plugin', description: 'Other', source: './other-plugin' }],
            }),
        );

        await installPlugin(makeOpts());

        const marketplace = readJson(join(localDir, 'marketplace.json'));
        expect(marketplace.plugins.find((p: any) => p.name === 'other-plugin')).toBeDefined();
        expect(marketplace.plugins.find((p: any) => p.name === 'apijack')).toBeDefined();
    });
});
