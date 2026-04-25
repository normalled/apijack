import { describe, test, expect, afterEach } from 'bun:test';
import { loadProjectAuth, loadProjectCommands, loadProjectDispatchers, loadProjectPlugins, loadProjectResolvers } from '../src/project-loader';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testRoot = join(tmpdir(), 'apijack-loader-test-' + Date.now());

describe('loadProjectAuth()', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('returns null strategy and onChallenge when no auth.ts exists', async () => {
        mkdirSync(testRoot, { recursive: true });
        const result = await loadProjectAuth(testRoot);
        expect(result.strategy).toBeNull();
        expect(result.onChallenge).toBeNull();
    });

    test('loads auth strategy from auth.ts', async () => {
        mkdirSync(testRoot, { recursive: true });
        writeFileSync(join(testRoot, 'auth.ts'), `
            export default {
                async authenticate(config) {
                    return { headers: { Authorization: 'Custom test' } };
                },
                async restore(cached) {
                    return cached;
                },
            };
        `);

        const result = await loadProjectAuth(testRoot);
        expect(result.strategy).not.toBeNull();
        expect(typeof result.strategy!.authenticate).toBe('function');
        expect(result.onChallenge).toBeNull();
    });

    test('loads onChallenge from auth.ts', async () => {
        const root = join(tmpdir(), 'apijack-loader-onchallenge-' + Date.now());
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'auth.ts'), `
            export async function onChallenge(status, body) {
                return { retry: 'true' };
            }
        `);

        try {
            const result = await loadProjectAuth(root);
            expect(result.strategy).toBeNull();
            expect(typeof result.onChallenge).toBe('function');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('loadProjectCommands()', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('returns empty array when no commands/ dir exists', async () => {
        mkdirSync(testRoot, { recursive: true });
        const result = await loadProjectCommands(testRoot);
        expect(result).toEqual([]);
    });

    test('loads command registrars from commands/*.ts', async () => {
        const cmdDir = join(testRoot, 'commands');
        mkdirSync(cmdDir, { recursive: true });
        writeFileSync(join(cmdDir, 'deploy.ts'), `
            export const name = 'deploy';
            export default function register(program, ctx) {
                program.command('deploy').action(() => {});
            }
        `);

        const result = await loadProjectCommands(testRoot);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('deploy');
        expect(typeof result[0]!.registrar).toBe('function');
    });

    test('loads multiple commands', async () => {
        const cmdDir = join(testRoot, 'commands');
        mkdirSync(cmdDir, { recursive: true });
        writeFileSync(join(cmdDir, 'a.ts'), `
            export const name = 'a';
            export default function register(program, ctx) {}
        `);
        writeFileSync(join(cmdDir, 'b.ts'), `
            export const name = 'b';
            export default function register(program, ctx) {}
        `);

        const result = await loadProjectCommands(testRoot);
        expect(result).toHaveLength(2);
    });
});

describe('loadProjectDispatchers()', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('returns empty array when no dispatchers/ dir exists', async () => {
        mkdirSync(testRoot, { recursive: true });
        const result = await loadProjectDispatchers(testRoot);
        expect(result).toEqual([]);
    });

    test('loads dispatcher handlers from dispatchers/*.ts', async () => {
        const dispDir = join(testRoot, 'dispatchers');
        mkdirSync(dispDir, { recursive: true });
        writeFileSync(join(dispDir, 'notify.ts'), `
            export const name = 'notify';
            export default async function handle(args, positionalArgs, ctx) {
                return { sent: true };
            }
        `);

        const result = await loadProjectDispatchers(testRoot);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('notify');
        expect(typeof result[0]!.handler).toBe('function');
        expect(result[0]!.requiresAuth).toBeUndefined();
    });

    test('reads requiresAuth export from dispatcher module', async () => {
        const dispDir = join(testRoot, 'dispatchers');
        mkdirSync(dispDir, { recursive: true });
        writeFileSync(join(dispDir, 'notify-auth.ts'), `
            export const name = 'notify-auth';
            export const requiresAuth = true;
            export default async function handle(args, positionalArgs, ctx) {
                return { sent: true };
            }
        `);

        const result = await loadProjectDispatchers(testRoot);
        expect(result).toHaveLength(1);
        expect(result[0]!.requiresAuth).toBe(true);
    });
});

describe('loadProjectCommands() — requiresAuth', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('reads requiresAuth export from command module', async () => {
        const cmdDir = join(testRoot, 'commands');
        mkdirSync(cmdDir, { recursive: true });
        writeFileSync(join(cmdDir, 'deploy-auth.ts'), `
            export const name = 'deploy-auth';
            export const requiresAuth = true;
            export default function register(program, ctx) {
                program.command('deploy-auth').action(() => {});
            }
        `);

        const result = await loadProjectCommands(testRoot);
        expect(result).toHaveLength(1);
        expect(result[0]!.requiresAuth).toBe(true);
    });

    test('leaves requiresAuth undefined when the export is missing', async () => {
        const cmdDir = join(testRoot, 'commands');
        mkdirSync(cmdDir, { recursive: true });
        writeFileSync(join(cmdDir, 'deploy-no-auth.ts'), `
            export const name = 'deploy-no-auth';
            export default function register(program, ctx) {}
        `);

        const result = await loadProjectCommands(testRoot);
        expect(result[0]!.requiresAuth).toBeUndefined();
    });

    test('ignores non-boolean requiresAuth values', async () => {
        const cmdDir = join(testRoot, 'commands');
        mkdirSync(cmdDir, { recursive: true });
        writeFileSync(join(cmdDir, 'deploy-bad-auth.ts'), `
            export const name = 'deploy-bad-auth';
            export const requiresAuth = 'yes';
            export default function register(program, ctx) {}
        `);

        const result = await loadProjectCommands(testRoot);
        expect(result[0]!.requiresAuth).toBeUndefined();
    });
});

describe('loadProjectResolvers()', () => {
    afterEach(() => {
        rmSync(testRoot, { recursive: true, force: true });
    });

    test('returns empty map when no resolvers/ dir exists', async () => {
        mkdirSync(testRoot, { recursive: true });
        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(0);
    });

    test('loads resolver functions from resolvers/*.ts (name from export)', async () => {
        const resDir = join(testRoot, 'resolvers');
        mkdirSync(resDir, { recursive: true });
        writeFileSync(join(resDir, 'lookup.ts'), `
            export const name = '_my_lookup';
            export default (argsStr) => 'resolved:' + argsStr;
        `);

        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(1);
        expect(result.has('_my_lookup')).toBe(true);
        expect(result.get('_my_lookup')!('hello')).toBe('resolved:hello');
    });

    test('falls back to filename when export name is missing', async () => {
        const resDir = join(testRoot, 'resolvers');
        mkdirSync(resDir, { recursive: true });
        writeFileSync(join(resDir, '_from_file.ts'), `
            export default () => 42;
        `);

        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(1);
        expect(result.has('_from_file')).toBe(true);
        expect(result.get('_from_file')!()).toBe(42);
    });

    test('skips resolvers whose name does not start with "_"', async () => {
        const resDir = join(testRoot, 'resolvers');
        mkdirSync(resDir, { recursive: true });
        writeFileSync(join(resDir, 'bad.ts'), `
            export const name = 'no_underscore';
            export default () => 'x';
        `);

        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(0);
    });

    test('skips resolvers whose filename does not start with "_" when no export name', async () => {
        const resDir = join(testRoot, 'resolvers');
        mkdirSync(resDir, { recursive: true });
        writeFileSync(join(resDir, 'plainname.ts'), `
            export default () => 'x';
        `);

        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(0);
    });

    test('skips resolvers whose name collides with a built-in', async () => {
        const resDir = join(testRoot, 'resolvers');
        mkdirSync(resDir, { recursive: true });
        writeFileSync(join(resDir, 'uuid.ts'), `
            export const name = '_uuid';
            export default () => 'overridden';
        `);

        const result = await loadProjectResolvers(testRoot);
        expect(result.size).toBe(0);
    });
});

describe('loadProjectPlugins()', () => {
    const makeRoot = (suffix: string) =>
        join(tmpdir(), `apijack-loader-plugins-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    test('returns empty array when no plugins.ts exists', async () => {
        const root = makeRoot('none');
        mkdirSync(root, { recursive: true });
        try {
            const result = await loadProjectPlugins(root);
            expect(result).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('loads plugin instances from plugins.ts default export', async () => {
        const root = makeRoot('default');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'plugins.ts'), `
            export default [
                { name: 'alpha', version: '1.0.0' },
                { name: 'beta' },
            ];
        `);

        try {
            const result = await loadProjectPlugins(root);
            expect(result).toHaveLength(2);
            expect(result[0]!.name).toBe('alpha');
            expect(result[0]!.version).toBe('1.0.0');
            expect(result[1]!.name).toBe('beta');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('returns empty array when default export is not an array', async () => {
        const root = makeRoot('not-array');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'plugins.ts'), `
            export default { name: 'not-an-array' };
        `);

        try {
            const result = await loadProjectPlugins(root);
            expect(result).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('returns empty array when plugins.ts has no default export', async () => {
        const root = makeRoot('no-default');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'plugins.ts'), `
            export const plugins = [{ name: 'named-export-only' }];
        `);

        try {
            const result = await loadProjectPlugins(root);
            expect(result).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('filters out null, primitives, and array entries', async () => {
        const root = makeRoot('filter');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'plugins.ts'), `
            export default [
                { name: 'good' },
                null,
                undefined,
                'string-entry',
                42,
                [{ name: 'nested-array' }],
                { name: 'also-good' },
            ];
        `);

        try {
            const result = await loadProjectPlugins(root);
            expect(result).toHaveLength(2);
            expect(result.map(p => p.name)).toEqual(['good', 'also-good']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test('returns empty array when plugins.ts throws on import', async () => {
        const root = makeRoot('throws');
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'plugins.ts'), `
            throw new Error('boom');
        `);

        try {
            const result = await loadProjectPlugins(root);
            expect(result).toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
