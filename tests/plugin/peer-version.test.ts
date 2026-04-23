import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkPeerRange, loadPluginPeerInfo } from '../../src/plugin/peer-version';

describe('checkPeerRange', () => {
    test('returns null (ok) when installed satisfies declared range', () => {
        expect(checkPeerRange({ declaredRange: '^1.0.0', installedVersion: '1.9.0' })).toBeNull();
        expect(checkPeerRange({ declaredRange: '^1.0.0', installedVersion: '1.0.0' })).toBeNull();
    });

    test('returns message when major mismatch', () => {
        const msg = checkPeerRange({ declaredRange: '^2.0.0', installedVersion: '1.9.0' });
        expect(msg).toContain('^2.0.0');
        expect(msg).toContain('1.9.0');
    });

    test('returns message when version below range', () => {
        expect(
            checkPeerRange({ declaredRange: '^1.5.0', installedVersion: '1.4.0' }),
        ).not.toBeNull();
    });

    test('returns null when declaredRange is missing (warn-only caller decides)', () => {
        expect(checkPeerRange({ declaredRange: undefined, installedVersion: '1.9.0' })).toBeNull();
    });

    test('returns message on invalid range', () => {
        expect(
            checkPeerRange({ declaredRange: 'not-semver', installedVersion: '1.9.0' }),
        ).toContain('invalid');
    });

    test('accepts broader ranges like >=1.0.0', () => {
        expect(checkPeerRange({ declaredRange: '>=1.0.0', installedVersion: '1.9.0' })).toBeNull();
    });

    test('accepts tilde ranges', () => {
        expect(checkPeerRange({ declaredRange: '~1.9.0', installedVersion: '1.9.5' })).toBeNull();
        expect(checkPeerRange({ declaredRange: '~1.9.0', installedVersion: '1.10.0' })).not.toBeNull();
    });
});

describe('loadPluginPeerInfo', () => {
    let workDir: string;

    beforeEach(() => {
        workDir = join(tmpdir(), `apijack-peer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(join(workDir, 'node_modules', 'fake-plugin'), { recursive: true });
    });

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true });
    });

    test('reads peerDependencies["@apijack/core"] from package.json', () => {
        writeFileSync(
            join(workDir, 'node_modules', 'fake-plugin', 'package.json'),
            JSON.stringify({
                name: 'fake-plugin',
                version: '1.0.0',
                peerDependencies: { '@apijack/core': '^1.0.0' },
            }),
        );
        const info = loadPluginPeerInfo('fake-plugin', workDir);
        expect(info.declaredRange).toBe('^1.0.0');
        expect(info.packagePath).toBeTruthy();
    });

    test('returns undefined range when package.json has no peerDependencies', () => {
        writeFileSync(
            join(workDir, 'node_modules', 'fake-plugin', 'package.json'),
            JSON.stringify({ name: 'fake-plugin', version: '1.0.0' }),
        );
        const info = loadPluginPeerInfo('fake-plugin', workDir);
        expect(info.declaredRange).toBeUndefined();
        expect(info.packagePath).toBeTruthy();
    });

    test('returns null packagePath when plugin package.json is missing', () => {
        // workDir has no node_modules/does-not-exist
        const info = loadPluginPeerInfo('does-not-exist', workDir);
        expect(info.declaredRange).toBeUndefined();
        expect(info.packagePath).toBeNull();
    });

    test('walks up parent directories to find node_modules', () => {
        // Create a nested dir; node_modules at workDir level
        const nested = join(workDir, 'a', 'b', 'c');
        mkdirSync(nested, { recursive: true });
        writeFileSync(
            join(workDir, 'node_modules', 'fake-plugin', 'package.json'),
            JSON.stringify({
                name: 'fake-plugin',
                version: '1.0.0',
                peerDependencies: { '@apijack/core': '^1.0.0' },
            }),
        );
        const info = loadPluginPeerInfo('fake-plugin', nested);
        expect(info.declaredRange).toBe('^1.0.0');
    });

    test('tolerates invalid JSON in package.json', () => {
        writeFileSync(
            join(workDir, 'node_modules', 'fake-plugin', 'package.json'),
            '{ not valid json',
        );
        const info = loadPluginPeerInfo('fake-plugin', workDir);
        expect(info.declaredRange).toBeUndefined();
        expect(info.packagePath).toBeTruthy();
    });
});
