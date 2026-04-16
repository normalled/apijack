import { describe, test, expect, afterEach } from 'bun:test';
import { loadProjectAuth, loadProjectCommands, loadProjectDispatchers, loadProjectResolvers } from '../src/project-loader';
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

    test('returns empty map when no dispatchers/ dir exists', async () => {
        mkdirSync(testRoot, { recursive: true });
        const result = await loadProjectDispatchers(testRoot);
        expect(result.size).toBe(0);
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
        expect(result.size).toBe(1);
        expect(result.has('notify')).toBe(true);
        expect(typeof result.get('notify')).toBe('function');
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
