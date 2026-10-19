import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCli, type Cli } from '../src/cli-builder';
import type { CliOptions } from '../src/types';
import type { AuthStrategy } from '../src/auth/types';
import { BasicAuthStrategy } from '../src/auth/basic';

/**
 * #179 — one cached session per environment instead of a single shared
 * session.json. These drive the real createCli().run() end to end; the
 * SessionManager unit coverage lives in session.test.ts.
 */

const repoRoot = join(import.meta.dir, '..');

const ENVIRONMENTS = {
    a: { url: 'http://a.example', user: 'alice', password: 'pa' },
    b: { url: 'http://b.example', user: 'bob', password: 'pb' },
};

const ROUTINE = `name: who
steps:
  - name: who
    command: who
`;

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number | undefined;
}

describe('per-environment sessions via cli.run (configPath / project mode)', () => {
    let root: string;
    let configPath: string;
    let mints: number;
    let cliOverrides: Partial<CliOptions>;

    // Each authenticate() mints a distinguishable session: "<user>#<n>".
    const strategy: AuthStrategy = {
        authenticate: async cfg => ({ headers: { 'X-Who': `${cfg.username}#${++mints}` } }),
        restore: async cached => cached,
    };

    beforeEach(() => {
        root = join(tmpdir(), `per-env-sessions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const apijackDir = join(root, '.apijack');
        mkdirSync(join(apijackDir, 'routines'), { recursive: true });
        configPath = join(apijackDir, 'config.json');
        writeFileSync(configPath, JSON.stringify({ active: 'a', environments: ENVIRONMENTS }));
        writeFileSync(join(apijackDir, 'routines', 'who.yaml'), ROUTINE);
        mints = 0;
        cliOverrides = {};
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    function makeCli(): Cli {
        const cli = createCli({
            name: 'testcli',
            description: 'per-env sessions',
            version: '1.0.0',
            specPath: '/v3/api-docs',
            auth: strategy,
            configPath,
            generatedDir: join(root, 'no-generated'),
            ...cliOverrides,
        });
        // "<baseUrl> <user>#<n>", or "<baseUrl> <user>:<password>" for a Basic session.
        const who = (ctx: { auth: { baseUrl: string }; session: { headers: Record<string, string> } }) =>
            `${ctx.auth.baseUrl} ${ctx.session.headers['X-Who'] ?? atob(ctx.session.headers.Authorization!.slice('Basic '.length))}`;

        cli.command('whoami', (program, ctx) => {
            program.command('whoami').action(() => {
                console.log(who(ctx));
            });
        }, { requiresAuth: true });
        cli.dispatcher('who', async (_args, _pos, ctx) => {
            console.log(who(ctx));

            return null;
        }, { requiresAuth: true });

        return cli;
    }

    async function run(...argv: string[]): Promise<RunResult> {
        const cli = makeCli();
        let stdout = '';
        let stderr = '';
        let exitCode: number | undefined;
        const origArgv = process.argv;
        const origLog = console.log;
        const origErr = console.error;
        const origStdout = process.stdout.write;
        const origStderr = process.stderr.write;
        const origExit = process.exit;

        try {
            process.argv = ['node', 'testcli', ...argv];
            console.log = (...args: unknown[]) => {
                stdout += args.join(' ') + '\n';
            };
            console.error = (...args: unknown[]) => {
                stderr += args.join(' ') + '\n';
            };
            process.stdout.write = ((c: string | Uint8Array) => {
                stdout += String(c);

                return true;
            }) as never;
            process.stderr.write = ((c: string | Uint8Array) => {
                stderr += String(c);

                return true;
            }) as never;
            process.exit = ((code?: number) => {
                exitCode = code ?? 0;
                throw new Error('__exit__');
            }) as never;

            try {
                await cli.run();
            } catch (e) {
                if ((e as Error).message !== '__exit__') throw e;
            }
        } finally {
            process.argv = origArgv;
            console.log = origLog;
            console.error = origErr;
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
            process.exit = origExit;
        }

        return { stdout, stderr, exitCode };
    }

    async function whoami(): Promise<string> {
        return (await run('whoami')).stdout.trim();
    }

    test('config switch keeps each environment\'s session and never sends one to another host', async () => {
        expect(await whoami()).toBe('http://a.example alice#1');

        await run('config', 'switch', 'b');
        expect(await whoami()).toBe('http://b.example bob#2');

        await run('config', 'switch', 'a');
        expect(await whoami()).toBe('http://a.example alice#1');
    });

    test('config clear-session clears only the active environment', async () => {
        await whoami();
        await run('config', 'switch', 'b');
        await whoami();
        await run('config', 'switch', 'a');

        const cleared = await run('config', 'clear-session');
        expect(cleared.exitCode).toBeUndefined();

        expect(await whoami()).toBe('http://a.example alice#3');
        await run('config', 'switch', 'b');
        expect(await whoami()).toBe('http://b.example bob#2');
    });

    test('config clear-session <name> clears that environment, not the active one', async () => {
        await whoami();
        await run('config', 'switch', 'b');
        await whoami();

        const cleared = await run('config', 'clear-session', 'a');
        expect(cleared.exitCode).toBeUndefined();

        expect(await whoami()).toBe('http://b.example bob#2');
        await run('config', 'switch', 'a');
        expect(await whoami()).toBe('http://a.example alice#3');
    });

    test('config clear-session <unknown> exits 1 and lists the configured environments', async () => {
        await whoami();

        const result = await run('config', 'clear-session', 'nope');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('nope');
        expect(result.stderr).toMatch(/\ba\b.*\bb\b/);
        expect(await whoami()).toBe('http://a.example alice#1');
    });

    test('config clear-session --all clears every environment', async () => {
        await whoami();
        await run('config', 'switch', 'b');
        await whoami();

        const cleared = await run('config', 'clear-session', '--all');
        expect(cleared.exitCode).toBeUndefined();

        expect(await whoami()).toBe('http://b.example bob#3');
        await run('config', 'switch', 'a');
        expect(await whoami()).toBe('http://a.example alice#4');
    });

    test('config clear-session --all <name> is rejected and clears nothing', async () => {
        await whoami();

        const result = await run('config', 'clear-session', 'a', '--all');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('--all');
        expect(await whoami()).toBe('http://a.example alice#1');
    });

    test('env-var credentials keep a session of their own, apart from every config environment', async () => {
        writeFileSync(configPath, JSON.stringify({ active: 'default', environments: { default: ENVIRONMENTS.a } }));
        expect(await whoami()).toBe('http://a.example alice#1');

        const envVars = { TESTCLI_URL: 'http://env.example', TESTCLI_USER: 'eve', TESTCLI_PASS: 'pe' };
        Object.assign(process.env, envVars);

        try {
            expect(await whoami()).toBe('http://env.example eve#2');

            const cleared = await run('config', 'clear-session');
            expect(cleared.exitCode).toBeUndefined();
            expect(cleared.stdout).toContain('TESTCLI_URL');
            expect(await whoami()).toBe('http://env.example eve#3');
        } finally {
            for (const key of Object.keys(envVars)) delete process.env[key];
        }

        expect(await whoami()).toBe('http://a.example alice#1');
    });

    test('config update-password: the old cached Basic session is not reused', async () => {
        writeFileSync(configPath, JSON.stringify({
            active: 'local',
            environments: { local: { url: 'http://localhost:9999', user: 'alice', password: 'old' } },
        }));
        // update-password is registered alongside knownSites.
        cliOverrides = { auth: new BasicAuthStrategy(), knownSites: {} };
        expect(await whoami()).toBe('http://localhost:9999 alice:old');

        const updated = await run('config', 'update-password', 'local', '--password', 'NEW');
        expect(updated.exitCode).toBeUndefined();

        expect(await whoami()).toBe('http://localhost:9999 alice:NEW');
    });

    test('cli.runRoutine() still starts fresh, clearing only the active environment\'s session', async () => {
        await whoami();
        await run('config', 'switch', 'b');
        await whoami();
        await run('config', 'switch', 'a');

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            const result = await makeCli().runRoutine('who');
            expect(result.status).toBe('ok');
        } finally {
            console.log = origLog;
        }

        expect(logs).toContain('http://a.example alice#3');
        await run('config', 'switch', 'b');
        expect(await whoami()).toBe('http://b.example bob#2');
    });
});

/**
 * Default mode (no configPath) keeps config and sessions under ~/.<cli>/, and
 * os.homedir() ignores runtime HOME changes, so these run a fixture CLI in a
 * child process with its home pointed at a temp dir: HOME, plus USERPROFILE,
 * which is what os.homedir() reads on Windows.
 */
describe('per-environment sessions in a child process (isolated HOME)', () => {
    let home: string;
    let fixture: string;

    beforeEach(() => {
        home = join(tmpdir(), `per-env-sessions-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        mkdirSync(join(home, '.testcli', 'routines'), { recursive: true });
        writeFileSync(join(home, '.testcli', 'config.json'), JSON.stringify({ active: 'a', environments: ENVIRONMENTS }));
        writeFileSync(join(home, '.testcli', 'routines', 'who.yaml'), ROUTINE);

        // Mints "<user>#<n>" with the counter kept on disk, so it spans processes.
        fixture = join(home, 'fixture-cli.ts');
        writeFileSync(fixture, `
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createCli } from ${JSON.stringify(join(repoRoot, 'src', 'cli-builder'))};

const counter = join(process.env.HOME, 'mints');
const cli = createCli({
    name: 'testcli',
    description: 'fixture',
    version: '0.0.0',
    specPath: '/v3/api-docs',
    generatedDir: join(process.env.HOME, 'no-generated'),
    ...(process.env.FIXTURE_CONFIG_PATH ? { configPath: process.env.FIXTURE_CONFIG_PATH } : {}),
    auth: {
        async authenticate(cfg) {
            const n = (existsSync(counter) ? Number(readFileSync(counter, 'utf-8')) : 0) + 1;
            writeFileSync(counter, String(n));
            return { headers: { 'X-Who': cfg.username + '#' + n } };
        },
        async restore(cached) {
            return cached;
        },
    },
});
const who = ctx => ctx.auth.baseUrl + ' ' + ctx.session.headers['X-Who'];
cli.command('whoami', (program, ctx) => {
    program.command('whoami').action(() => console.log(who(ctx)));
}, { requiresAuth: true });
cli.dispatcher('who', async (_args, _pos, ctx) => {
    console.log(who(ctx));
    return null;
}, { requiresAuth: true });
await cli.run();
`);
    });

    afterEach(() => {
        rmSync(home, { recursive: true, force: true });
    });

    function run(args: string[], env: Record<string, string> = {}): RunResult {
        const proc = Bun.spawnSync([process.execPath, fixture, ...args], {
            cwd: home,
            env: { ...process.env, HOME: home, USERPROFILE: home, ...env },
        });

        return { stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), exitCode: proc.exitCode };
    }

    test('default mode: switching away and back does not log you out', () => {
        expect(run(['whoami']).stdout.trim()).toBe('http://a.example alice#1');

        run(['config', 'switch', 'b']);
        expect(run(['whoami']).stdout.trim()).toBe('http://b.example bob#2');

        run(['config', 'switch', 'a']);
        expect(run(['whoami']).stdout.trim()).toBe('http://a.example alice#1');
    });

    test('default mode: routine run reuses the environment\'s cached session', () => {
        expect(run(['whoami']).stdout.trim()).toBe('http://a.example alice#1');

        for (const mode of [[], ['--json'], ['--quiet']]) {
            const result = run(['routine', 'run', 'who', ...mode]);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('http://a.example alice#1');
        }
    });

    test('with a configPath (project mode), nothing touches ~/.<cli>/session.json', () => {
        const projectDir = join(home, 'project', '.apijack');
        mkdirSync(join(projectDir, 'routines'), { recursive: true });
        writeFileSync(join(projectDir, 'config.json'), JSON.stringify({ active: 'a', environments: ENVIRONMENTS }));
        writeFileSync(join(projectDir, 'routines', 'who.yaml'), ROUTINE);
        const globalSession = join(home, '.testcli', 'session.json');
        const sentinel = JSON.stringify({ headers: { 'X-Who': 'global-sentinel' } });
        writeFileSync(globalSession, sentinel);

        const project = { FIXTURE_CONFIG_PATH: join(projectDir, 'config.json') };
        const outputs = [
            run(['whoami'], project),
            run(['config', 'switch', 'b'], project),
            run(['routine', 'run', 'who'], project),
            run(['config', 'clear-session'], project),
            run(['config', 'clear-session', '--all'], project),
        ];

        expect(outputs.map(o => o.exitCode)).toEqual([0, 0, 0, 0, 0]);
        expect(outputs.map(o => o.stdout).join('')).not.toContain('global-sentinel');
        expect(readFileSync(globalSession, 'utf-8')).toBe(sentinel);
    });
});
