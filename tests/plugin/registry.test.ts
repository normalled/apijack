import { describe, expect, test } from 'bun:test';
import { PluginRegistry } from '../../src/plugin/registry';
import type { ApijackPlugin } from '../../src/types';

function mkPlugin(overrides: Partial<ApijackPlugin> = {}): ApijackPlugin {
    return { name: 'testp', version: '1.0.0', ...overrides };
}

describe('PluginRegistry', () => {
    test('register() stores plugins', () => {
        const r = new PluginRegistry();
        const p = mkPlugin();
        r.register(p);
        expect(r.getAll()).toEqual([p]);
    });

    test('register() called twice with same name throws', () => {
        const r = new PluginRegistry();
        r.register(mkPlugin({ name: 'one' }));
        expect(() => r.register(mkPlugin({ name: 'one' }))).toThrow(/already registered/);
    });

    test('register() allows different plugin names', () => {
        const r = new PluginRegistry();
        r.register(mkPlugin({ name: 'a' }));
        r.register(mkPlugin({ name: 'b' }));
        expect(r.getAll()).toHaveLength(2);
    });

    test('get() returns plugin by name or undefined', () => {
        const r = new PluginRegistry();
        r.register(mkPlugin({ name: 'known' }));
        expect(r.get('known')?.name).toBe('known');
        expect(r.get('unknown')).toBeUndefined();
    });
});
