import { describe, expect, test } from 'bun:test';
import {
    PluginNamespaceError,
    PluginCollisionError,
    PluginPeerMismatchError,
} from '../../src/plugin/errors';

describe('PluginNamespaceError', () => {
    test('captures plugin name, violating key, expected prefix', () => {
        const err = new PluginNamespaceError('faker', '_other', '_faker');
        expect(err.pluginName).toBe('faker');
        expect(err.resolverName).toBe('_other');
        expect(err.expectedPrefix).toBe('_faker');
        expect(err.message).toContain('faker');
        expect(err.message).toContain('_other');
        expect(err.message).toContain('_faker');
    });
});

describe('PluginCollisionError', () => {
    test('captures colliding name and both sources', () => {
        const err = new PluginCollisionError('_faker', 'faker-v1', 'faker-legacy');
        expect(err.resolverName).toBe('_faker');
        expect(err.sourceA).toBe('faker-v1');
        expect(err.sourceB).toBe('faker-legacy');
        expect(err.message).toMatch(/_faker/);
    });
});

describe('PluginPeerMismatchError', () => {
    test('captures plugin name, declared range, installed version', () => {
        const err = new PluginPeerMismatchError('faker', '^2.0.0', '1.9.0');
        expect(err.pluginName).toBe('faker');
        expect(err.declaredRange).toBe('^2.0.0');
        expect(err.installedVersion).toBe('1.9.0');
        expect(err.message).toContain('faker');
    });
});
