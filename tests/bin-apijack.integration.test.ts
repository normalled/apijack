import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const repoRoot = join(import.meta.dir, '..');
const binPath = join(repoRoot, 'bin', 'apijack.ts');
const projectRoot = join(tmpdir(), `apijack-bin-integration-${Date.now()}-${process.pid}`);
const fakeHome = join(projectRoot, '.home');
const sessionFile = join(projectRoot, '.apijack', 'session.json');

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

async function runBin(args: string[]): Promise<RunResult> {
    // process.execPath is the bun binary running this test — using it directly
    // avoids a `bun` lookup on PATH and matches the runtime that owns these tests.
    const proc = Bun.spawn([process.execPath, binPath, ...args], {
        cwd: projectRoot,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            HOME: fakeHome,
            APIJACK_SKIP_UPDATE: '1',
            // The routine path's _buildRoutineRuntime calls resolveAuth() which
            // needs either env vars or .apijack/config.json — even though our
            // .apijack/auth.ts overrides the strategy, resolveAuth still gates
            // routine startup. Sentinel values; never used over the network.
            APIJACK_URL: 'http://localhost:9999',
            APIJACK_USER: 'fixture-user',
            APIJACK_PASS: 'fixture-pass',
        },
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
}

beforeAll(() => {
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(fakeHome, { recursive: true });

    const apijackDir = join(projectRoot, '.apijack');
    mkdirSync(apijackDir, { recursive: true });
    mkdirSync(join(apijackDir, 'commands'), { recursive: true });
    mkdirSync(join(apijackDir, 'dispatchers'), { recursive: true });
    mkdirSync(join(apijackDir, 'resolvers'), { recursive: true });
    mkdirSync(join(apijackDir, 'routines'), { recursive: true });

    // .apijack.json — marks this dir as an apijack project so the binary
    // resolves configDir/projectRoot here instead of falling back to ~/.apijack.
    writeFileSync(
        join(projectRoot, '.apijack.json'),
        JSON.stringify({ name: 'bin-int-cli' }),
    );

    // Plugin — should appear in `plugins list` output.
    writeFileSync(
        join(apijackDir, 'plugins.ts'),
        `export default [
    { name: 'bin_int_plugin', version: '9.9.9' },
];
`,
    );

    // Custom command — should be invocable as \`apijack foo\`.
    writeFileSync(
        join(apijackDir, 'commands', 'foo.ts'),
        `export default (program) => {
    program.command('foo').action(() => {
        process.stdout.write('FOO_COMMAND_RAN\\n');
    });
};
`,
    );

    // Custom command with requiresAuth: true — should trigger the project
    // auth strategy below and surface the resulting session via ctx.
    writeFileSync(
        join(apijackDir, 'commands', 'auth-probe.ts'),
        `export const requiresAuth = true;
export default (program, ctx) => {
    program.command('auth-probe').action(() => {
        process.stdout.write('AUTH_HEADER=' + (ctx?.session?.headers?.['X-Test-Auth'] ?? 'MISSING') + '\\n');
    });
};
`,
    );

    // Custom dispatcher — invocable from a routine via \`command: bar\`.
    writeFileSync(
        join(apijackDir, 'dispatchers', 'bar.ts'),
        `export default async (args) => {
    return { dispatched: 'bar', received: args };
};
`,
    );

    // Custom resolver — must start with _; usable as \`$_baz\` in routines.
    writeFileSync(
        join(apijackDir, 'resolvers', '_baz.ts'),
        `export default () => 'BAZ_RESOLVED';
`,
    );

    // Custom auth strategy — returns a sentinel session so the auth-probe
    // command can prove the project's auth.ts was loaded and used.
    writeFileSync(
        join(apijackDir, 'auth.ts'),
        `export default {
    async authenticate() {
        return { headers: { 'X-Test-Auth': 'AUTHED_BY_FIXTURE' } };
    },
    async restore(cached) {
        return cached;
    },
};
`,
    );

    // Routine that exercises the bar dispatcher.
    writeFileSync(
        join(apijackDir, 'routines', 'use-bar.yaml'),
        `name: use-bar
description: Invoke the bar dispatcher
steps:
  - name: invoke-bar
    command: bar
    args:
      --hello: "world"
    output: barResult
`,
    );

    // Routine that exercises the _baz resolver by passing $_baz through to bar.
    writeFileSync(
        join(apijackDir, 'routines', 'use-baz.yaml'),
        `name: use-baz
description: Resolve $_baz and forward to bar
steps:
  - name: forward-baz
    command: bar
    args:
      --resolved: "$_baz"
    output: bazResult
`,
    );
});

beforeEach(() => {
    // SessionManager persists the resolved session to disk; clear it so
    // each test exercises the project's auth.ts strategy from scratch.
    if (existsSync(sessionFile)) rmSync(sessionFile);
});

afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true });
});

describe('bin/apijack.ts boot-time .apijack/* registration', () => {
    test('plugins.ts → cli.use(): plugin appears in `plugins list`', async () => {
        const result = await runBin(['plugins', 'list']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('bin_int_plugin');
        expect(result.stdout).toContain('9.9.9');
    });

    test('commands/foo.ts → cli.command(): custom command runs', async () => {
        const result = await runBin(['foo']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('FOO_COMMAND_RAN');
    });

    test('dispatchers/bar.ts → cli.dispatcher(): invocable from a routine', async () => {
        const result = await runBin(['routine', 'run', 'use-bar', '--json']);
        expect(result.exitCode).toBe(0);

        const payload = JSON.parse(result.stdout) as {
            status: string;
            output: { barResult?: { dispatched?: string; received?: Record<string, unknown> } };
        };
        expect(payload.status).toBe('ok');
        expect(payload.output.barResult?.dispatched).toBe('bar');
        expect(payload.output.barResult?.received).toEqual({ '--hello': 'world' });
    });

    test('resolvers/_baz.ts → cli.resolver(): $_baz resolves inside a routine', async () => {
        const result = await runBin(['routine', 'run', 'use-baz', '--json']);
        expect(result.exitCode).toBe(0);

        const payload = JSON.parse(result.stdout) as {
            status: string;
            output: { bazResult?: { received?: Record<string, unknown> } };
        };
        expect(payload.status).toBe('ok');
        expect(payload.output.bazResult?.received).toEqual({ '--resolved': 'BAZ_RESOLVED' });
    });

    test('auth.ts → custom strategy: requiresAuth command receives the strategy\'s session', async () => {
        const result = await runBin(['auth-probe']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('AUTH_HEADER=AUTHED_BY_FIXTURE');
    });
});
