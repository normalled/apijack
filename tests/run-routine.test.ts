import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runRoutine } from '../src/run-routine';
import { SessionManager } from '../src/session';

describe('runRoutine (standalone)', () => {
    let tmpHome: string;
    let projectDir: string;
    let originalHome: string | undefined;
    let originalCwd: string;

    beforeEach(() => {
        const id = `run-routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        tmpHome = join(tmpdir(), `${id}-home`);
        projectDir = join(tmpdir(), `${id}-project`);
        mkdirSync(projectDir, { recursive: true });
        mkdirSync(join(tmpHome, '.apijack', 'routines'), { recursive: true });

        // Project marker so findProjectConfig() returns a result and dispatchers are loaded.
        writeFileSync(join(projectDir, '.apijack.json'), JSON.stringify({}));

        // Project-local env config (when a .apijack.json is present, configDir = projectDir/.apijack/).
        mkdirSync(join(projectDir, '.apijack', 'routines'), { recursive: true });
        writeFileSync(join(projectDir, '.apijack', 'config.json'), JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));

        // Routine that uses a project-defined dispatcher (so we don't need a real API).
        writeFileSync(join(projectDir, '.apijack', 'routines', 'echo.yaml'),
            `name: echo
steps:
  - name: call-echo
    command: echo-dispatch
    args:
      msg: hi
    output: ping
`);

        // .apijack/dispatchers/echo-dispatch.ts in the project dir
        mkdirSync(join(projectDir, '.apijack', 'dispatchers'), { recursive: true });
        writeFileSync(join(projectDir, '.apijack', 'dispatchers', 'echo-dispatch.ts'),
            `export const name = 'echo-dispatch';
export default async (args) => ({ echoed: args.msg });
`);

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;
        originalCwd = process.cwd();
        process.chdir(projectDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);

        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        rmSync(tmpHome, { recursive: true, force: true });
        rmSync(projectDir, { recursive: true, force: true });
    });

    test('runs routine end-to-end via project dispatcher', async () => {
        const result = await runRoutine('echo');
        expect(result.status).toBe('ok');
        expect(result.output).toEqual({ ping: { echoed: 'hi' } });
    });

    test('throws when no active env config exists', async () => {
        rmSync(join(projectDir, '.apijack', 'config.json'));
        await expect(runRoutine('echo')).rejects.toThrow(/active env|setup/i);
    });

    describe('opts.config', () => {
        beforeEach(() => {
            writeFileSync(join(projectDir, '.apijack', 'config.json'), JSON.stringify({
                active: 'default',
                environments: {
                    default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
                    coolsilk: { url: 'http://localhost:7777', user: 'cs', password: 'p' },
                },
            }));
            writeFileSync(join(projectDir, '.apijack', 'routines', 'where.yaml'),
                `name: where
steps:
  - name: base-url
    command: where-dispatch
    output: here
`);
            writeFileSync(join(projectDir, '.apijack', 'dispatchers', 'where-dispatch.ts'),
                `export default async (args, positional, ctx) => ctx.auth.baseUrl;
`);
        });

        test('runs the routine against the named environment', async () => {
            const result = await runRoutine('where', { config: 'coolsilk' });
            expect(result.status).toBe('ok');
            expect(result.output).toEqual({ here: 'http://localhost:7777' });
        });

        test('clears the named environment\'s session, not the active one\'s', async () => {
            const configDir = join(projectDir, '.apijack');

            for (const env of ['default', 'coolsilk']) {
                SessionManager.forEnvironment(configDir, { env, baseUrl: 'x', username: 'y' }).save({ headers: {} });
            }

            await runRoutine('where', { config: 'coolsilk' });

            expect(existsSync(join(configDir, 'sessions', 'coolsilk.json'))).toBe(false);
            expect(existsSync(join(configDir, 'sessions', 'default.json'))).toBe(true);
        });

        test('uses the named environment\'s sessionAuth for the handshake', async () => {
            const cookies = { extract: ['SESSION'], applyTo: ['GET'] };
            writeFileSync(join(projectDir, '.apijack', 'config.json'), JSON.stringify({
                active: 'default',
                environments: {
                    default: {
                        url: 'http://localhost:9999', user: 'u', password: 'p',
                        sessionAuth: { session: { endpoint: '/default-session' }, cookies },
                    },
                    coolsilk: {
                        url: 'http://localhost:7777', user: 'cs', password: 'p',
                        sessionAuth: { session: { endpoint: '/coolsilk-session' }, cookies },
                    },
                },
            }));
            writeFileSync(join(projectDir, '.apijack', 'routines', 'authed-where.yaml'),
                `name: authed-where
steps:
  - name: base-url
    command: authed-where-dispatch
`);
            writeFileSync(join(projectDir, '.apijack', 'dispatchers', 'authed-where-dispatch.ts'),
                `export const requiresAuth = true;
export default async (args, positional, ctx) => ctx.auth.baseUrl;
`);
            const fetched: string[] = [];
            const originalFetch = globalThis.fetch;
            globalThis.fetch = (async (url: string | URL | Request) => {
                fetched.push(String(url));

                return new Response('', { status: 200 });
            }) as typeof fetch;

            try {
                const result = await runRoutine('authed-where', { config: 'coolsilk' });
                expect(result.status).toBe('ok');
            } finally {
                globalThis.fetch = originalFetch;
            }

            expect(fetched).toEqual(['http://localhost:7777/coolsilk-session']);
        });

        test('rejects an unknown name with the configured environments', async () => {
            await expect(runRoutine('where', { config: 'nope' }))
                .rejects.toThrow("Environment 'nope' not found. Available: default, coolsilk");
        });
    });

    test('respects explicit cwd option', async () => {
        const result = await runRoutine('echo', { cwd: projectDir });
        expect(result.status).toBe('ok');
    });

    test('uses projectConfig.name as programName in surfaced errors', async () => {
        // Re-write project marker with a name; remove env config so the bootstrap surfaces
        // the "No active env config. Run '<programName> setup' ..." error from createCli().
        writeFileSync(join(projectDir, '.apijack.json'), JSON.stringify({ name: 'mybrand' }));
        rmSync(join(projectDir, '.apijack', 'config.json'));

        await expect(runRoutine('echo')).rejects.toThrow(/Run 'mybrand setup'/);
    });

    test('opts.programName overrides projectConfig.name in surfaced errors', async () => {
        writeFileSync(join(projectDir, '.apijack.json'), JSON.stringify({ name: 'mybrand' }));
        rmSync(join(projectDir, '.apijack', 'config.json'));

        await expect(runRoutine('echo', { programName: 'override' }))
            .rejects.toThrow(/Run 'override setup'/);
    });

    test('falls back to cliName when neither opts.programName nor projectConfig.name set', async () => {
        // Project marker has no `name` field (default beforeEach state); remove env config.
        rmSync(join(projectDir, '.apijack', 'config.json'));

        await expect(runRoutine('echo')).rejects.toThrow(/Run 'apijack setup'/);
    });
});

describe('runRoutine (standalone, no project marker — global config path)', () => {
    let tmpHome: string;
    let cwdDir: string;
    let originalHome: string | undefined;
    let originalCwd: string;

    beforeEach(() => {
        const id = `run-routine-global-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        tmpHome = join(tmpdir(), `${id}-home`);
        cwdDir = join(tmpdir(), `${id}-cwd`);
        mkdirSync(cwdDir, { recursive: true });
        // No .apijack.json marker — exercises the `else` branch in run-routine.ts where
        // configDir = ${HOME}/.<cliName>/.
        mkdirSync(join(tmpHome, '.apijack', 'routines'), { recursive: true });
        writeFileSync(join(tmpHome, '.apijack', 'config.json'), JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));
        writeFileSync(join(tmpHome, '.apijack', 'routines', 'echo.yaml'),
            `name: echo
variables:
  msg: "global-hello"
steps:
  - name: noop
    command: noop-dispatch
    args:
      msg: "$msg"
    output: ping
`);

        // Without a project marker, project-loader doesn't load dispatchers, so we register
        // a no-op consumer dispatcher would normally not be available. Instead, the routine
        // engine's "command not found" path will throw — which is what we exercise.
        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;
        originalCwd = process.cwd();
        process.chdir(cwdDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);

        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        rmSync(tmpHome, { recursive: true, force: true });
        rmSync(cwdDir, { recursive: true, force: true });
    });

    test('finds routine in $HOME/.apijack/routines/ when no project marker is present', async () => {
        const result = await runRoutine('echo');
        // The routine itself fails (no dispatcher for `noop-dispatch`), but the bootstrap
        // succeeded — the routine was located in the global config dir, not project-local.
        expect(result.status).toBe('failed');
        expect(result.steps[0]!).toMatchObject({ name: 'noop', status: 'failed' });
    });
});
