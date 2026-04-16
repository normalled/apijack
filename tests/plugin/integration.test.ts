import { describe, test, expect, afterEach } from 'bun:test';
import { installPlugin } from '../../src/plugin/install';
import { uninstallPlugin } from '../../src/plugin/uninstall';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-integration-' + Date.now());
const testDataDir = join(testRoot, '.apijack');
const testMarketplaceDir = join(testDataDir, 'plugin-marketplace');
const sourceDir = join(import.meta.dir, '../..');

function readJson(path: string): any {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('plugin install → uninstall roundtrip', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('full lifecycle: install, verify, uninstall, verify preservation', async () => {
        const installCalls: string[][] = [];
        const installResult = await installPlugin({
            version: '0.1.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir,
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            runClaude: async (args) => {
                installCalls.push(args);
            },
        });
        expect(installResult.success).toBe(true);
        expect(installCalls).toHaveLength(2);

        // Marketplace + nested plugin manifest
        const marketplace = readJson(join(testMarketplaceDir, '.claude-plugin', 'marketplace.json'));
        expect(marketplace.plugins.find((p: any) => p.name === 'apijack')).toBeDefined();

        const manifest = readJson(join(testMarketplaceDir, 'apijack', '.claude-plugin', 'plugin.json'));
        expect(manifest.name).toBe('apijack');

        // User data written
        expect(existsSync(join(testDataDir, 'routines'))).toBe(true);
        expect(existsSync(join(testDataDir, 'plugin.json'))).toBe(true);

        // Uninstall
        const uninstallResult = await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async () => {},
        });
        expect(uninstallResult.success).toBe(true);

        // Marketplace gone, user data preserved
        expect(existsSync(testMarketplaceDir)).toBe(false);
        expect(existsSync(testDataDir)).toBe(true);
        expect(existsSync(join(testDataDir, 'routines'))).toBe(true);
    });

    test('reinstall after uninstall works cleanly', async () => {
        await installPlugin({
            version: '0.1.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir,
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            runClaude: async () => {},
        });

        await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async () => {},
        });

        const result = await installPlugin({
            version: '0.2.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir,
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            runClaude: async () => {},
        });

        expect(result.success).toBe(true);

        const manifest = readJson(join(testMarketplaceDir, 'apijack', '.claude-plugin', 'plugin.json'));
        expect(manifest.version).toBe('0.2.0');
    });
});
