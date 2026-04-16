import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { loadPluginConfig, type PluginConfig } from '../src/mcp-server-entry';

const testDir = join(homedir(), '.apijack-test-entry');

describe('loadPluginConfig()', () => {
    beforeEach(() => {
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test('reads CLI invocation from plugin config', () => {
        const config: PluginConfig = {
            cliInvocation: ['bun', 'run', '/path/to/cli.ts'],
            generatedDir: '/path/to/generated',
        };
        writeFileSync(join(testDir, 'plugin.json'), JSON.stringify(config));

        const result = loadPluginConfig(testDir);
        expect(result).not.toBeNull();
        expect(result!.cliInvocation).toEqual(['bun', 'run', '/path/to/cli.ts']);
        expect(result!.generatedDir).toBe('/path/to/generated');
    });

    test('returns null when config file missing', () => {
        const result = loadPluginConfig(join(testDir, 'nonexistent'));
        expect(result).toBeNull();
    });
});
