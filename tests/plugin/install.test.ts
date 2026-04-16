import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { installPlugin } from '../../src/plugin/install';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-plugin-test-' + Date.now());
const testDataDir = join(testRoot, '.apijack');
const testMarketplaceDir = join(testDataDir, 'plugin-marketplace');

function readJson(path: string): any {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

function makeOpts(overrides?: Record<string, unknown>) {
    const claudeCalls: string[][] = [];

    return {
        opts: {
            version: '0.1.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir: join(import.meta.dir, '../..'),
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            runClaude: async (args: string[]) => {
                claudeCalls.push(args);
            },
            ...overrides,
        },
        claudeCalls,
    };
}

describe('installPlugin()', () => {
    beforeEach(() => {
        mkdirSync(testRoot, { recursive: true });
    });

    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('writes marketplace.json with apijack plugin entry', async () => {
        const { opts } = makeOpts();
        const result = await installPlugin(opts);
        expect(result.success).toBe(true);

        const marketplacePath = join(testMarketplaceDir, '.claude-plugin', 'marketplace.json');
        expect(existsSync(marketplacePath)).toBe(true);

        const marketplace = readJson(marketplacePath);
        expect(marketplace.name).toBe('apijack');
        expect(marketplace.metadata?.description).toBeTruthy();
        const plugin = marketplace.plugins.find((p: any) => p.name === 'apijack');
        expect(plugin).toBeDefined();
        expect(plugin.source).toBe('./apijack');
    });

    test('returns plugin dir nested in marketplace', async () => {
        const { opts } = makeOpts();
        const result = await installPlugin(opts);
        expect(result.marketplaceDir).toBe(testMarketplaceDir);
        expect(result.pluginDir).toBe(join(testMarketplaceDir, 'apijack'));
    });

    test('writes plugin.json manifest under plugin dir', async () => {
        const { opts } = makeOpts();
        const result = await installPlugin(opts);
        const manifest = readJson(join(result.pluginDir, '.claude-plugin', 'plugin.json'));
        expect(manifest.name).toBe('apijack');
        expect(manifest.version).toBe('0.1.0');
    });

    test('copies skills into plugin dir', async () => {
        const { opts } = makeOpts();
        const result = await installPlugin(opts);
        expect(existsSync(join(result.pluginDir, 'skills', 'write-routine', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(result.pluginDir, 'skills', 'setup-api', 'SKILL.md'))).toBe(true);
    });

    test('writes .mcp.json with CLAUDE_PLUGIN_ROOT reference', async () => {
        const { opts } = makeOpts();
        const result = await installPlugin(opts);
        const mcpJson = readJson(join(result.pluginDir, '.mcp.json'));
        expect(mcpJson.mcpServers.apijack.args).toContain('${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.bundle.js');
    });

    test('creates user data directory and writes runtime plugin.json', async () => {
        const { opts } = makeOpts();
        await installPlugin(opts);
        expect(existsSync(testDataDir)).toBe(true);
        expect(existsSync(join(testDataDir, 'routines'))).toBe(true);

        const pluginConfig = readJson(join(testDataDir, 'plugin.json'));
        expect(pluginConfig.cliInvocation).toEqual(['bun', 'run', 'src/cli.ts']);
        expect(pluginConfig.generatedDir).toBe('src/generated');
    });

    test('invokes claude CLI to register marketplace and install plugin', async () => {
        const { opts, claudeCalls } = makeOpts();
        await installPlugin(opts);

        expect(claudeCalls).toEqual([
            ['plugin', 'marketplace', 'add', testMarketplaceDir],
            ['plugin', 'install', 'apijack@apijack'],
        ]);
    });

    test('propagates errors from runClaude', async () => {
        const { opts } = makeOpts({
            runClaude: async () => {
                throw new Error('boom');
            },
        });

        expect(installPlugin(opts)).rejects.toThrow('boom');
    });

    test('rolls back marketplace dir if claude CLI fails on a fresh install', async () => {
        const { opts } = makeOpts({
            runClaude: async () => {
                throw new Error('register failed');
            },
        });

        expect(existsSync(testMarketplaceDir)).toBe(false);
        await installPlugin(opts).catch(() => {});
        expect(existsSync(testMarketplaceDir)).toBe(false);
    });

    test('does not roll back a pre-existing marketplace dir on failure', async () => {
        mkdirSync(testMarketplaceDir, { recursive: true });
        const { opts } = makeOpts({
            runClaude: async () => {
                throw new Error('register failed');
            },
        });

        await installPlugin(opts).catch(() => {});
        expect(existsSync(testMarketplaceDir)).toBe(true);
    });

    test('surfaces checkClaudeCli errors and does not touch filesystem', async () => {
        const opts = {
            version: '0.1.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir: join(import.meta.dir, '../..'),
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            checkClaudeCli: () => {
                throw new Error('claude not found');
            },
        };

        await installPlugin(opts).catch((err) => {
            expect(err.message).toContain('claude not found');
        });
        expect(existsSync(testMarketplaceDir)).toBe(false);
    });
});
