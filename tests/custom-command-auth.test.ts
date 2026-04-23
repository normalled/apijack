import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createCli } from '../src/cli-builder';
import type { CliOptions, CliContext } from '../src/types';
import { BasicAuthStrategy } from '../src/auth/basic';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeOptions(overrides: Partial<CliOptions> = {}): CliOptions {
    return {
        name: 'testcli',
        description: 'A test CLI',
        version: '1.0.0',
        specPath: '/v3/api-docs',
        auth: new BasicAuthStrategy(),
        outputModes: ['json'],
        ...overrides,
    };
}

async function captureOutput(fn: () => Promise<void>): Promise<void> {
    const origLog = console.log;
    const origErr = console.error;

    console.log = () => {};
    console.error = () => {};

    try {
        await fn();
    } catch {
        // process.exit is mocked to throw
    } finally {
        console.log = origLog;
        console.error = origErr;
    }
}

describe('custom command requiresAuth + ctx.saveSession / ctx.resolveSession', () => {
    let originalArgv: string[];
    let originalExit: typeof process.exit;
    let testConfigDir: string;
    let configPath: string;
    let sessionPath: string;

    beforeEach(() => {
        originalArgv = process.argv;
        originalExit = process.exit;

        (process as unknown as { exit: (code?: number) => void }).exit = (code?: number) => {
            throw new Error(`process.exit(${code ?? 0})`);
        };

        testConfigDir = join(tmpdir(), 'apijack-ctx-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        mkdirSync(testConfigDir, { recursive: true });
        configPath = join(testConfigDir, 'config.json');
        sessionPath = join(testConfigDir, 'session.json');

        writeFileSync(
            configPath,
            JSON.stringify({
                active: 'default',
                environments: {
                    default: {
                        url: 'http://localhost:8080',
                        user: 'testuser',
                        password: 'testpass',
                    },
                },
            }),
        );
    });

    afterEach(() => {
        process.argv = originalArgv;
        (process as unknown as { exit: typeof process.exit }).exit = originalExit;
        rmSync(testConfigDir, { recursive: true, force: true });
    });

    test('ctx exposes resolveSession and saveSession methods', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let capturedCtx: CliContext | null = null;

        cli.command('capture', (program, ctx) => {
            program.command('capture').action(() => {
                capturedCtx = ctx;
            });
        });

        process.argv = ['node', 'testcli', 'capture'];

        await captureOutput(() => cli.run());

        expect(capturedCtx).not.toBeNull();
        expect(typeof capturedCtx!.resolveSession).toBe('function');
        expect(typeof capturedCtx!.saveSession).toBe('function');
    });

    test('requiresAuth: true resolves session before the action runs', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionAtAction: unknown = 'unset';

        cli.command(
            'needs-auth',
            (program, ctx) => {
                program.command('needs-auth').action(() => {
                    sessionAtAction = ctx.session;
                });
            },
            { requiresAuth: true },
        );

        process.argv = ['node', 'testcli', 'needs-auth'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).not.toBeNull();
        expect(sessionAtAction).toHaveProperty('headers');
    });

    test('requiresAuth: false leaves ctx.session null (existing behavior)', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionAtAction: unknown = 'unset';

        cli.command('no-auth', (program, ctx) => {
            program.command('no-auth').action(() => {
                sessionAtAction = ctx.session;
            });
        });

        process.argv = ['node', 'testcli', 'no-auth'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).toBeNull();
    });

    test('customCommandDefaults.requiresAuth applies when per-command flag is unset', async () => {
        const cli = createCli(
            makeOptions({ configPath, customCommandDefaults: { requiresAuth: true } }),
        );

        let sessionAtAction: unknown = 'unset';

        cli.command('default-auth', (program, ctx) => {
            program.command('default-auth').action(() => {
                sessionAtAction = ctx.session;
            });
        });

        process.argv = ['node', 'testcli', 'default-auth'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).not.toBeNull();
    });

    test('per-command requiresAuth: false overrides settings default true', async () => {
        const cli = createCli(
            makeOptions({ configPath, customCommandDefaults: { requiresAuth: true } }),
        );

        let sessionAtAction: unknown = 'unset';

        cli.command(
            'explicit-off',
            (program, ctx) => {
                program.command('explicit-off').action(() => {
                    sessionAtAction = ctx.session;
                });
            },
            { requiresAuth: false },
        );

        process.argv = ['node', 'testcli', 'explicit-off'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).toBeNull();
    });

    test('--dry-run skips requiresAuth preAction hook', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionAtAction: unknown = 'unset';

        cli.command(
            'preview-skip',
            (program, ctx) => {
                program.command('preview-skip').action(() => {
                    sessionAtAction = ctx.session;
                });
            },
            { requiresAuth: true },
        );

        process.argv = ['node', 'testcli', 'preview-skip', '--dry-run'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).toBeNull();
    });

    test('-o routine-step skips requiresAuth preAction hook', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let actionRan = false;

        cli.command(
            'step-skip',
            (program) => {
                program.command('step-skip').action(() => {
                    actionRan = true;
                });
            },
            { requiresAuth: true },
        );

        process.argv = ['node', 'testcli', 'step-skip', '-o', 'routine-step'];

        await captureOutput(() => cli.run());

        // routine-step exits before our action runs; we only care that it didn't crash on auth resolution
        expect(actionRan).toBe(false);
    });

    test('ctx.saveSession() persists ctx.session to disk', async () => {
        const cli = createCli(makeOptions({ configPath }));

        cli.command(
            'save',
            (program, ctx) => {
                program.command('save').action(async () => {
                    ctx.session = { headers: { Authorization: 'Bearer new-token' } };
                    await ctx.saveSession();
                });
            },
            { requiresAuth: true },
        );

        process.argv = ['node', 'testcli', 'save'];

        await captureOutput(() => cli.run());

        expect(existsSync(sessionPath)).toBe(true);
        const persisted = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        expect(persisted.headers.Authorization).toBe('Bearer new-token');
    });

    test('ctx.saveSession() with null ctx.session invalidates the session file', async () => {
        writeFileSync(sessionPath, JSON.stringify({ headers: { Authorization: 'old' } }));

        const cli = createCli(makeOptions({ configPath }));

        cli.command('wipe', (program, ctx) => {
            program.command('wipe').action(async () => {
                ctx.session = null;
                await ctx.saveSession();
            });
        });

        process.argv = ['node', 'testcli', 'wipe'];

        await captureOutput(() => cli.run());

        expect(existsSync(sessionPath)).toBe(false);
    });

    test('requiresAuth hook fires even when registrar adds a differently-named top-level subcommand', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionAtAction: unknown = 'unset';

        cli.command(
            'alias-name',
            (program, ctx) => {
                // Registrar intentionally uses a different name than the one passed to cli.command()
                program.command('real-name').action(() => {
                    sessionAtAction = ctx.session;
                });
            },
            { requiresAuth: true },
        );

        process.argv = ['node', 'testcli', 'real-name'];

        await captureOutput(() => cli.run());

        expect(sessionAtAction).not.toBeNull();
    });

    test('ctx.resolveSession() populates ctx.session on demand', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionBefore: unknown = 'unset';
        let sessionAfter: unknown = 'unset';

        cli.command('manual', (program, ctx) => {
            program.command('manual').action(async () => {
                sessionBefore = ctx.session;
                await ctx.resolveSession();
                sessionAfter = ctx.session;
            });
        });

        process.argv = ['node', 'testcli', 'manual'];

        await captureOutput(() => cli.run());

        expect(sessionBefore).toBeNull();
        expect(sessionAfter).not.toBeNull();
        expect(sessionAfter).toHaveProperty('headers');
    });
});

describe('dispatcher requiresAuth', () => {
    let originalArgv: string[];
    let originalExit: typeof process.exit;
    let testConfigDir: string;
    let configPath: string;

    beforeEach(() => {
        originalArgv = process.argv;
        originalExit = process.exit;

        (process as unknown as { exit: (code?: number) => void }).exit = (code?: number) => {
            throw new Error(`process.exit(${code ?? 0})`);
        };

        testConfigDir = join(tmpdir(), 'apijack-disp-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        mkdirSync(testConfigDir, { recursive: true });
        configPath = join(testConfigDir, 'config.json');

        writeFileSync(
            configPath,
            JSON.stringify({
                active: 'default',
                environments: {
                    default: {
                        url: 'http://localhost:8080',
                        user: 'testuser',
                        password: 'testpass',
                    },
                },
            }),
        );
    });

    afterEach(() => {
        process.argv = originalArgv;
        (process as unknown as { exit: typeof process.exit }).exit = originalExit;
        rmSync(testConfigDir, { recursive: true, force: true });
    });

    test('requiresAuth dispatcher resolves session before the handler runs', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionInHandler: unknown = 'unset';

        cli.dispatcher(
            'do-thing',
            async (_args, _pos, ctx) => {
                sessionInHandler = ctx.session;

                return { ok: true };
            },
            { requiresAuth: true },
        );

        // Drive the dispatcher through a routine file
        const routinesDir = join(testConfigDir, 'routines');
        mkdirSync(routinesDir, { recursive: true });
        writeFileSync(
            join(routinesDir, 'run-disp.yml'),
            `name: run-disp
steps:
  - name: call
    command: do-thing
`,
        );

        process.argv = ['node', 'testcli', 'routine', 'run', 'run-disp'];

        await captureOutput(() => cli.run());

        expect(sessionInHandler).not.toBeNull();
        expect(sessionInHandler).toHaveProperty('headers');
    });

    test('non-requiresAuth dispatcher leaves ctx.session null', async () => {
        const cli = createCli(makeOptions({ configPath }));

        let sessionInHandler: unknown = 'unset';

        cli.dispatcher('no-auth-disp', async (_args, _pos, ctx) => {
            sessionInHandler = ctx.session;

            return { ok: true };
        });

        const routinesDir = join(testConfigDir, 'routines');
        mkdirSync(routinesDir, { recursive: true });
        writeFileSync(
            join(routinesDir, 'run-no-auth.yml'),
            `name: run-no-auth
steps:
  - name: call
    command: no-auth-disp
`,
        );

        process.argv = ['node', 'testcli', 'routine', 'run', 'run-no-auth'];

        await captureOutput(() => cli.run());

        expect(sessionInHandler).toBeNull();
    });
});
