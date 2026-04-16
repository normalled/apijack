import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { installPlugin } from '../../src/plugin/install';
import { uninstallPlugin } from '../../src/plugin/uninstall';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-uninstall-test-' + Date.now());
const testDataDir = join(testRoot, '.apijack');
const testMarketplaceDir = join(testDataDir, 'plugin-marketplace');

describe('uninstallPlugin()', () => {
    const claudeCalls: string[][] = [];

    beforeEach(async () => {
        mkdirSync(testRoot, { recursive: true });
        claudeCalls.length = 0;
        await installPlugin({
            version: '0.1.0',
            userDataDir: testDataDir,
            marketplaceDir: testMarketplaceDir,
            sourceDir: join(import.meta.dir, '../..'),
            cliInvocation: ['bun', 'run', 'src/cli.ts'],
            generatedDir: 'src/generated',
            runClaude: async () => {},
        });
    });

    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('removes the marketplace directory', async () => {
        expect(existsSync(testMarketplaceDir)).toBe(true);

        await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async (args) => {
                claudeCalls.push(args);
            },
        });

        expect(existsSync(testMarketplaceDir)).toBe(false);
    });

    test('invokes claude CLI to uninstall plugin and remove marketplace', async () => {
        await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async (args) => {
                claudeCalls.push(args);
            },
        });

        expect(claudeCalls).toEqual([
            ['plugin', 'uninstall', 'apijack@apijack'],
            ['plugin', 'marketplace', 'remove', 'apijack'],
        ]);
    });

    test('preserves user data directory', async () => {
        await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async () => {},
        });

        expect(existsSync(testDataDir)).toBe(true);
        expect(existsSync(join(testDataDir, 'routines'))).toBe(true);
    });

    test('tolerates claude CLI failures and still cleans up files', async () => {
        const result = await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async () => {
                throw new Error('claude not found');
            },
        });

        expect(result.success).toBe(true);
        expect(existsSync(testMarketplaceDir)).toBe(false);
    });

    test('handles already-uninstalled gracefully', async () => {
        rmSync(testMarketplaceDir, { recursive: true, force: true });

        const result = await uninstallPlugin({
            marketplaceDir: testMarketplaceDir,
            runClaude: async () => {},
        });

        expect(result.success).toBe(true);
    });
});
