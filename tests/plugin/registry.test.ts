import { describe, expect, test } from 'bun:test';
import { PluginRegistry } from '../../src/plugin/registry';
import type { ApijackPlugin, CustomResolver } from '../../src/types';

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

describe('PluginRegistry.validateNamespace (via validateAll)', () => {
    test('passes when all resolvers are within namespace', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            resolvers: { _faker: () => 'x', _faker_seed: () => 'y' },
        });
        expect(() => r.validateAll()).not.toThrow();
    });

    test('throws PluginNamespaceError when resolver name is outside namespace', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            resolvers: { _other: () => 'x' },
        });
        expect(() => r.validateAll()).toThrow(/faker.*_other/);
    });

    test('invokes createRoutineResolvers with {} to validate its keys', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            createRoutineResolvers: () => ({ _faker: () => 'x' }),
        });
        expect(() => r.validateAll()).not.toThrow();
    });

    test('catches namespace violation in createRoutineResolvers output', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            createRoutineResolvers: () => ({ _stranger: () => 'x' }),
        });
        expect(() => r.validateAll()).toThrow(/faker.*_stranger/);
    });

    test('allows exact match name (_faker only, no suffix)', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            resolvers: { _faker: () => 'x' },
        });
        expect(() => r.validateAll()).not.toThrow();
    });

    test('rejects prefix-match without underscore separator (e.g. _fakerish)', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'faker',
            resolvers: { _fakerish: () => 'x' },
        });
        expect(() => r.validateAll()).toThrow(/_fakerish/);
    });

    test('plugin name must match lowercase identifier grammar', () => {
        const r = new PluginRegistry();
        expect(() => r.register({ name: 'Faker' })).toThrow(/invalid plugin name/i);
        expect(() => r.register({ name: 'faker-plus' })).toThrow(/invalid plugin name/i);
        expect(() => r.register({ name: '1faker' })).toThrow(/invalid plugin name/i);
    });

    test('tolerates createRoutineResolvers throwing on empty opts (skips namespace check)', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'strict',
            createRoutineResolvers: () => { throw new Error('needs opts'); },
        });
        // Should not throw PluginNamespaceError because dry call failed gracefully
        expect(() => r.validateAll()).not.toThrow();
    });
});

describe('PluginRegistry.validateCollisions (via validateAll)', () => {
    test('throws when plugin resolver collides with core built-in', () => {
        const r = new PluginRegistry();
        // Plugin named "uuid" registers `_uuid` (within its own namespace) which is a core built-in
        r.register({ name: 'uuid', resolvers: { _uuid: () => 'x' } });
        expect(() => r.validateAll()).toThrow(/_uuid/);
    });

    test('throws when plugin resolver collides with project resolver', () => {
        const r = new PluginRegistry();
        r.register({ name: 'faker', resolvers: { _faker: () => 'x' } });
        const projectResolvers = new Map<string, CustomResolver>([['_faker', () => 'y']]);
        expect(() => r.validateAll(projectResolvers)).toThrow(/_faker/);
    });

    test('passes when no collisions', () => {
        const r = new PluginRegistry();
        r.register({ name: 'faker', resolvers: { _faker: () => 'x' } });
        const projectResolvers = new Map<string, CustomResolver>([['_myproj', () => 'y']]);
        expect(() => r.validateAll(projectResolvers)).not.toThrow();
    });

    test('collision includes createRoutineResolvers output', () => {
        const r = new PluginRegistry();
        r.register({
            name: 'uuid',
            createRoutineResolvers: () => ({ _uuid: () => 'x' }),
        });
        expect(() => r.validateAll()).toThrow(/_uuid/);
    });
});
