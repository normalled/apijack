import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { shouldReinstallPlugin, refreshAfterUpdate } from '../src/post-update';

const root = join(tmpdir(), 'apijack-post-update-test-' + Date.now());
const marketplaceDir = join(root, 'plugin-marketplace');

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('shouldReinstallPlugin()', () => {
    test('false when mcp is off', () => {
        mkdirSync(marketplaceDir, { recursive: true });
        expect(shouldReinstallPlugin({ mcpEnabled: false, pluginEnabled: true, marketplaceDir })).toBe(false);
    });

    test('false when plugin is off', () => {
        mkdirSync(marketplaceDir, { recursive: true });
        expect(shouldReinstallPlugin({ mcpEnabled: true, pluginEnabled: false, marketplaceDir })).toBe(false);
    });

    test('false when the plugin was never installed (no marketplace dir)', () => {
        expect(shouldReinstallPlugin({ mcpEnabled: true, pluginEnabled: true, marketplaceDir })).toBe(false);
    });

    test('true when mcp and plugin are on and the plugin was installed', () => {
        mkdirSync(marketplaceDir, { recursive: true });
        expect(shouldReinstallPlugin({ mcpEnabled: true, pluginEnabled: true, marketplaceDir })).toBe(true);
    });
});

describe('refreshAfterUpdate()', () => {
    function recorder() {
        const calls: { args: string[]; env?: Record<string, string> }[] = [];

        return {
            calls,
            spawnCli: async (args: string[], env?: Record<string, string>) => {
                calls.push(env ? { args, env } : { args });

                return 0;
            },
        };
    }

    test('refreshes skills (via APIJACK_REFRESH_SKILLS, no argv) before re-running plugin install', async () => {
        const r = recorder();
        await refreshAfterUpdate({ reinstallPlugin: true, spawnCli: r.spawnCli });
        expect(r.calls).toEqual([
            { args: [], env: { APIJACK_REFRESH_SKILLS: '1' } },
            { args: ['plugin', 'install'] },
        ]);
    });

    test('only refreshes skills when reinstallPlugin is false', async () => {
        const r = recorder();
        await refreshAfterUpdate({ reinstallPlugin: false, spawnCli: r.spawnCli });
        expect(r.calls).toEqual([{ args: [], env: { APIJACK_REFRESH_SKILLS: '1' } }]);
    });
});
