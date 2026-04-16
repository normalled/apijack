import { describe, test, expect } from 'bun:test';
import { getPluginPaths } from '../../src/plugin/paths';
import { homedir } from 'os';
import { join } from 'path';

describe('getPluginPaths()', () => {
    const paths = getPluginPaths('0.1.0');

    test('userDataDir points to ~/.apijack', () => {
        expect(paths.userDataDir).toBe(join(homedir(), '.apijack'));
    });

    test('marketplaceDir points to ~/.apijack/plugin-marketplace', () => {
        expect(paths.marketplaceDir).toBe(join(homedir(), '.apijack', 'plugin-marketplace'));
    });

    test('sourceDir points to project root', () => {
        expect(paths.sourceDir).toContain('apijack');
    });
});
