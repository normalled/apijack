import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Command } from 'commander';
import { createCli, type Cli } from '../src/cli-builder';
import type { CliOptions, CliContext, CommandRegistrar, DispatcherHandler, ApijackPlugin } from '../src/types';
import { BasicAuthStrategy } from '../src/auth/basic';
import { configUpdatePasswordAction } from '../src/commands/config/update-password/update-password';
import { scanLeadingOptions } from '../src/leading-options';
import { SessionManager } from '../src/session';

const coreManifest = JSON.parse(
    readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf-8'),
) as { version: string };

function makeOptions(overrides: Partial<CliOptions> = {}): CliOptions {
    return {
        name: 'testcli',
        description: 'A test CLI',
        version: '1.0.0',
        specPath: '/v3/api-docs',
        auth: new BasicAuthStrategy(),
        outputModes: ['json', 'table', 'quiet'],
        ...overrides,
    };
}

/**
 * Capture all output (console.log, console.error, and process.stdout.write)
 * during an async callback. Commander's --help writes directly to stdout.
 */
async function captureOutput(fn: () => Promise<void>): Promise<string> {
    const logs: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    const origWrite = process.stdout.write;

    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    console.error = (...args: unknown[]) => logs.push(args.join(' '));
    process.stdout.write = (chunk: any, ...rest: any[]) => {
        logs.push(typeof chunk === 'string' ? chunk : chunk.toString());

        return true;
    };

    try {
        await fn();
    } catch {
    // Expected: process.exit calls
    } finally {
        console.log = origLog;
        console.error = origErr;
        process.stdout.write = origWrite;
    }

    return logs.join('\n');
}

describe('createCli()', () => {
    test('returns object with command(), dispatcher(), resolver(), run() methods', () => {
        const cli = createCli(makeOptions());
        expect(typeof cli.command).toBe('function');
        expect(typeof cli.dispatcher).toBe('function');
        expect(typeof cli.resolver).toBe('function');
        expect(typeof cli.run).toBe('function');
    });

    test('command() stores registrar for later invocation', () => {
        const cli = createCli(makeOptions());
        const registrar: CommandRegistrar = (_program, _ctx) => {};
        // Should not throw
        cli.command('my-cmd', registrar);
    // We verify this is wired correctly in integration-style tests below
    });

    test('dispatcher() stores handler for the composed dispatcher', () => {
        const cli = createCli(makeOptions());
        const handler: DispatcherHandler = async (_args, _pos, _ctx) => ({});
        // Should not throw
        cli.dispatcher('my-dispatch', handler);
    });

    test('resolver() stores handler for the composed dispatcher', () => {
        const cli = createCli(makeOptions());
        // Should not throw
        cli.resolver('_my_fn', _argsStr => 'ok');
    });
});

/**
 * To test the built-in commands without actually running the full auth flow,
 * we construct the CLI and inspect the Commander program that would be built.
 * We do this by mocking process.argv and intercepting parseAsync.
 */
describe('built-in commands', () => {
    let originalArgv: string[];
    let originalExit: typeof process.exit;
    let exitCode: number | undefined;

    beforeEach(() => {
        originalArgv = process.argv;
        originalExit = process.exit;
        exitCode = undefined;
        // Mock process.exit to prevent test runner from dying
        (process as any).exit = (code?: number) => {
            exitCode = code ?? 0;
            throw new Error(`process.exit(${code})`);
        };
    });

    afterEach(() => {
        process.argv = originalArgv;
        (process as any).exit = originalExit;
    });

    test('setup, login, config (list, switch), generate, and routine commands are registered', async () => {
    // Use --help with a non-existent command to force Commander to parse and build the tree
        const cli = createCli(makeOptions());

        // We can build a program internally by running with --help, which will call showCustomHelp and exit
        // Instead, let's test the structure by hooking into run() at the parse stage
        process.argv = ['node', 'testcli', '--help'];

        // Capture console output
        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected: process.exit(0) from showCustomHelp
        }

        console.log = origLog;
        const output = logs.join('\n');

        // Verify core commands appear in help
        expect(output).toContain('setup');
        expect(output).toContain('login');
        expect(output).toContain('config');
        expect(output).toContain('generate');
        expect(output).toContain('routine');
    });

    test('knownSites option registers config import and config update-password', async () => {
        const cli = createCli(
            makeOptions({
                knownSites: {
                    staging: { url: 'https://staging.example.com', description: 'Staging' },
                },
            }),
        );

        process.argv = ['node', 'testcli', 'config', '--help'];

        const output = await captureOutput(() => cli.run());

        // config import and update-password should be registered as subcommands
        expect(output).toContain('import');
        expect(output).toContain('update-password');
    });

    test('config import is NOT registered when knownSites is not provided', async () => {
        const cli = createCli(makeOptions({ knownSites: undefined }));

        process.argv = ['node', 'testcli', 'config', '--help'];

        const output = await captureOutput(() => cli.run());

        // config import should NOT be present
        expect(output).not.toContain('import');
        expect(output).not.toContain('update-password');
    });

    test('output mode flags are registered (--table, --quiet, -o)', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected
        }

        console.log = origLog;
        const output = logs.join('\n');

        expect(output).toContain('--table');
        expect(output).toContain('--quiet');
        expect(output).toContain('-o <format>');
    });

    test('output mode flags respect outputModes option', async () => {
    // Only json mode (no table or quiet)
        const cli = createCli(makeOptions({ outputModes: ['json'] }));

        process.argv = ['node', 'testcli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected
        }

        console.log = origLog;
        const output = logs.join('\n');

        // --table and --quiet should NOT be registered since not in outputModes
        expect(output).not.toContain('--table');
        expect(output).not.toContain('--quiet');
        // -o should still be registered
        expect(output).toContain('-o <format>');
    });

    test('custom help separates core commands from API commands', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli', '--help'];

        const output = await captureOutput(() => cli.run());

        // Should show "Commands:" section with core commands
        expect(output).toContain('Commands:');
        // Should show usage and description
        expect(output).toContain('Usage: testcli');
        expect(output).toContain('A test CLI');
    });

    test('custom commands appear in their own section, visible without --help', async () => {
        const cli = createCli(makeOptions());
        cli.command('my-tool', (program) => {
            program.command('my-tool').description('A custom tool');
        });

        // No --help flag — just bare invocation
        process.argv = ['node', 'testcli'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain('Custom Commands:');
        expect(output).toContain('my-tool');
        expect(output).toContain('A custom tool');
    });

    test('custom commands section is hidden when there are none', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli'];

        const output = await captureOutput(() => cli.run());

        expect(output).not.toContain('Custom Commands:');
    });

    test('routine subcommands are registered (list, run, validate, test, init)', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli', 'routine', '--help'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain('list');
        expect(output).toContain('run');
        expect(output).toContain('validate');
        expect(output).toContain('test');
        expect(output).toContain('init');
    });

    test('env var prefix is derived from cliName uppercased', async () => {
    // Set env vars matching the test CLI name
        process.env.TESTCLI_URL = 'https://env.example.com';
        process.env.TESTCLI_USER = 'envuser';
        process.env.TESTCLI_PASS = 'envpass';

        const cli = createCli(makeOptions({ name: 'testcli' }));

        // Run with a non-existent command that won't match — we just want to verify auth resolution
        process.argv = ['node', 'testcli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected: process.exit from help
        }

        console.log = origLog;

        // Clean up
        delete process.env.TESTCLI_URL;
        delete process.env.TESTCLI_USER;
        delete process.env.TESTCLI_PASS;

        // If we got this far without error, env var resolution worked
        expect(exitCode).toBe(0);
    });

    test('program name and version are set correctly', async () => {
        const cli = createCli(
            makeOptions({
                name: 'mycli',
                description: 'My custom CLI tool',
                version: '2.5.0',
            }),
        );

        process.argv = ['node', 'mycli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected
        }

        console.log = origLog;
        const output = logs.join('\n');

        expect(output).toContain('Usage: mycli');
        expect(output).toContain('My custom CLI tool');
    });

    test('without programName, help and hints show storage name (cliName)', async () => {
        const cli = createCli(
            makeOptions({
                name: 'apijack',
                description: 'Default branding',
            }),
        );
        cli.command('extra', (program) => {
            program.command('extra').description('extra command');
        });

        // No --help flag triggers showCustomHelp's compact path that emits the
        // "run '<cliName> --help'" hint.
        process.argv = ['node', 'apijack'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain('Usage: apijack');
        expect(output).toContain("Run 'apijack <command> --help'");
    });

    test('programName overrides display name in help and hints, leaves cliName for storage', async () => {
        const cli = createCli(
            makeOptions({
                name: 'apijack',           // storage identity (unchanged)
                programName: 'acme',       // display-only branding
                description: 'Acme CLI',
            }),
        );
        cli.command('extra', (program) => {
            program.command('extra').description('extra command');
        });

        process.argv = ['node', 'acme'];

        const output = await captureOutput(() => cli.run());

        // Display strings show the override.
        expect(output).toContain('Usage: acme');
        expect(output).toContain('Acme CLI');
        expect(output).toContain("Run 'acme <command> --help'");
        // The bare "apijack" identity should NOT appear in user-facing branding.
        expect(output).not.toMatch(/Usage: apijack/);
        expect(output).not.toMatch(/Run 'apijack /);
    });

    test('programName defaults to name when omitted', async () => {
        const cli = createCli(
            makeOptions({
                name: 'foo',
                description: 'Foo CLI',
            }),
        );

        process.argv = ['node', 'foo', '--help'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain('Usage: foo');
    });

    test('--dry-run flag is registered', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected
        }

        console.log = origLog;
        const output = logs.join('\n');

        expect(output).toContain('--dry-run');
    });

    test('-o help text includes curl and curl-with-creds formats', async () => {
        const cli = createCli(makeOptions());

        process.argv = ['node', 'testcli', '--help'];

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            await cli.run();
        } catch (e: any) {
            // Expected
        }

        console.log = origLog;
        const output = logs.join('\n');

        expect(output).toContain('curl');
        expect(output).toContain('curl-with-creds');
    });
});

describe('displayName threaded through subcommand registrar hints (#91)', () => {
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

        testConfigDir = join(tmpdir(), 'apijack-displayname-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        mkdirSync(testConfigDir, { recursive: true });
        configPath = join(testConfigDir, 'config.json');
        // Empty-environments config — triggers the "no envs configured" hint paths.
        writeFileSync(configPath, JSON.stringify({ active: '', environments: {} }));
    });

    afterEach(() => {
        process.argv = originalArgv;
        (process as unknown as { exit: typeof process.exit }).exit = originalExit;
        rmSync(testConfigDir, { recursive: true, force: true });
    });

    test('config list: hint uses programName when set', async () => {
        const cli = createCli(makeOptions({ name: 'apijack', programName: 'mycli', configPath }));

        process.argv = ['node', 'mycli', 'config', 'list'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain("Run 'mycli setup'");
        expect(output).not.toContain("Run 'apijack setup'");
    });

    test('config list: hint falls back to cliName when programName omitted', async () => {
        const cli = createCli(makeOptions({ name: 'apijack', configPath }));

        process.argv = ['node', 'apijack', 'config', 'list'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain("Run 'apijack setup'");
    });

    test('routine list: hint uses programName when set', async () => {
        const cli = createCli(makeOptions({ name: 'apijack', programName: 'mycli', configPath }));

        process.argv = ['node', 'mycli', 'routine', 'list'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain("Run 'mycli routine init'");
        expect(output).not.toContain("Run 'apijack routine init'");
    });

    test('routine list: hint falls back to cliName when programName omitted', async () => {
        const cli = createCli(makeOptions({ name: 'apijack', configPath }));

        process.argv = ['node', 'apijack', 'routine', 'list'];

        const output = await captureOutput(() => cli.run());

        expect(output).toContain("Run 'apijack routine init'");
    });

    test('configUpdatePasswordAction: throws with displayName when set', async () => {
        await expect(configUpdatePasswordAction({
            password: 'new',
            loadConfig: async () => ({ active: '', environments: {} }),
            save: async () => {},
            cliName: 'apijack',
            displayName: 'mycli',
            saveOpts: {},
        })).rejects.toThrow("Run 'mycli config import' first");
    });

    test('configUpdatePasswordAction: throws with cliName when displayName omitted', async () => {
        await expect(configUpdatePasswordAction({
            password: 'new',
            loadConfig: async () => ({ active: '', environments: {} }),
            save: async () => {},
            cliName: 'apijack',
            saveOpts: {},
        })).rejects.toThrow("Run 'apijack config import' first");
    });
});

describe('index exports', () => {
    test('all expected exports are available', async () => {
        const indexModule = await import('../src/index');

        // Functions
        expect(typeof indexModule.createCli).toBe('function');
        expect(typeof indexModule.BasicAuthStrategy).toBe('function');
        expect(typeof indexModule.BearerTokenStrategy).toBe('function');
        expect(typeof indexModule.ApiKeyStrategy).toBe('function');
        expect(typeof indexModule.formatOutput).toBe('function');
        expect(typeof indexModule.updateEnvironmentField).toBe('function');
        expect(typeof indexModule.verifyCredentials).toBe('function');
    });
});

describe('cli.use()', () => {
    test('accepts a plugin without error', () => {
        const cli = createCli({
            name: 'smoke',
            description: 'smoke',
            version: '0.0.0',
            specPath: '',
            auth: new BasicAuthStrategy(),
        });
        const plugin: ApijackPlugin = { name: 'noop', version: '0.1.0' };
        expect(() => cli.use(plugin)).not.toThrow();
    });

    test('throws when same plugin name registered twice', () => {
        const cli = createCli({
            name: 'smoke',
            description: 'smoke',
            version: '0.0.0',
            specPath: '',
            auth: new BasicAuthStrategy(),
        });
        cli.use({ name: 'x' });
        expect(() => cli.use({ name: 'x' })).toThrow(/already registered/);
    });
});

describe('cli.run() plugin validation', () => {
    test('throws PluginNamespaceError when plugin registers wrong-namespace resolver', async () => {
        const cli = createCli({
            name: 'smoke',
            description: 'smoke',
            version: '1.9.0',
            specPath: '',
            auth: new BasicAuthStrategy(),
        });
        cli.use({
            name: 'faker',
            resolvers: { _other: () => 'x' },
        });
        await expect(cli.run()).rejects.toThrow(/faker.*_other/);
    });

    test('throws PluginCollisionError when plugin shadows a core built-in', async () => {
        const cli = createCli({
            name: 'smoke',
            description: 'smoke',
            version: '1.9.0',
            specPath: '',
            auth: new BasicAuthStrategy(),
        });
        cli.use({
            name: 'uuid',
            resolvers: { _uuid: () => 'collision' },
        });
        await expect(cli.run()).rejects.toThrow(/_uuid/);
    });

    test('warns to stderr when plugin has no __package', async () => {
        let stderrOut = '';
        const origErrWrite = process.stderr.write.bind(process.stderr);
        const origOutWrite = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;

        try {
            process.stderr.write = ((c: string | Uint8Array) => {
                stderrOut += String(c);

                return true;
            }) as never;
            // Suppress stdout/help output and neutralise process.exit so run()'s downstream
            // help path can't terminate the test runner.
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            (process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
                throw new Error(`process.exit(${code})`);
            }) as never;
            const cli = createCli({
                name: 'smoke',
                description: 'smoke',
                version: '1.9.0',
                specPath: '',
                auth: new BasicAuthStrategy(),
            });
            cli.use({ name: 'nopkg', resolvers: { _nopkg: () => 'x' } });
            // run() may do more than validation; we just need it to at least reach the peer-check pass.
            // Catch any downstream errors unrelated to plugin validation.
            await cli.run().catch(() => {});
        } finally {
            process.stderr.write = origErrWrite as never;
            process.stdout.write = origOutWrite as never;
            console.log = origLog;
            (process as unknown as { exit: typeof origExit }).exit = origExit;
        }
        expect(stderrOut).toContain('nopkg');
        expect(stderrOut).toMatch(/did not self-report|skipping peer-version/i);
    });

    test('peer-version check reads core version, not consumer CLI version', async () => {
        const workDir = join(tmpdir(), `apijack-peer-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(join(workDir, 'node_modules', '@fake', 'plugin'), { recursive: true });
        const peerRange = `^${coreManifest.version.split('.')[0]}.0.0`;
        writeFileSync(
            join(workDir, 'node_modules', '@fake', 'plugin', 'package.json'),
            JSON.stringify({
                name: '@fake/plugin',
                version: '1.0.0',
                peerDependencies: { '@apijack/core': peerRange },
            }),
        );

        const origCwd = process.cwd();
        const origStderr = process.stderr.write.bind(process.stderr);
        const origStdout = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;

        try {
            process.chdir(workDir);
            process.stderr.write = (() => true) as never;
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            process.exit = (() => {}) as never;

            const cli = createCli({
                name: 'consumer-cli',
                description: 'test',
                version: '99.0.0',
                specPath: '',
                auth: new BasicAuthStrategy(),
            });
            cli.use({
                name: 'fakep',
                resolvers: { _fakep: () => 'x' },
                __package: { name: '@fake/plugin' },
            });

            let thrown: unknown = null;

            try {
                await cli.run();
            } catch (e) {
                thrown = e;
            }
            expect(String(thrown)).not.toContain('PluginPeerMismatch');
        } finally {
            process.chdir(origCwd);
            process.stderr.write = origStderr as never;
            process.stdout.write = origStdout as never;
            console.log = origLog;
            process.exit = origExit;
            rmSync(workDir, { recursive: true, force: true });
        }
    });

    test('peer-version check throws when plugin peer range does not include core version', async () => {
        const workDir = join(tmpdir(), `apijack-peer-mismatch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(join(workDir, 'node_modules', '@fake', 'plugin'), { recursive: true });
        writeFileSync(
            join(workDir, 'node_modules', '@fake', 'plugin', 'package.json'),
            JSON.stringify({
                name: '@fake/plugin',
                version: '1.0.0',
                peerDependencies: { '@apijack/core': '^999.0.0' },
            }),
        );

        const origCwd = process.cwd();
        const origStderr = process.stderr.write.bind(process.stderr);
        const origStdout = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;

        try {
            process.chdir(workDir);
            process.stderr.write = (() => true) as never;
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            process.exit = (() => {}) as never;
            const cli = createCli({
                name: 'consumer-cli',
                description: 'test',
                version: '0.1.0',
                specPath: '',
                auth: new BasicAuthStrategy(),
            });
            cli.use({
                name: 'fakep',
                resolvers: { _fakep: () => 'x' },
                __package: { name: '@fake/plugin' },
            });
            await expect(cli.run()).rejects.toThrow(/fakep.*\^999\.0\.0/);
        } finally {
            process.chdir(origCwd);
            process.stderr.write = origStderr as never;
            process.stdout.write = origStdout as never;
            console.log = origLog;
            process.exit = origExit;
            rmSync(workDir, { recursive: true, force: true });
        }
    });

    test('plugins check is reachable even when validation would fail at startup', async () => {
        const origArgv = process.argv;
        const origStderr = process.stderr.write.bind(process.stderr);
        const origStdout = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;
        let stderrOut = '';
        let exitCode: number | undefined;

        try {
            process.argv = ['node', 'cli', 'plugins', 'check'];
            process.stderr.write = ((c: string | Uint8Array) => {
                stderrOut += String(c);

                return true;
            }) as never;
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            process.exit = ((code?: number) => {
                exitCode = code;
                throw new Error('__exit__');
            }) as never;

            const cli = createCli({
                name: 'smoke',
                description: 'smoke',
                version: '1.9.0',
                specPath: '',
                auth: new BasicAuthStrategy(),
            });
            // Register a plugin that would fail namespace validation.
            cli.use({
                name: 'faker',
                resolvers: { _other: () => 'x' },
            });

            // cli.run() would normally throw PluginNamespaceError at startup.
            // With the guard for `plugins check`, the action runs and reports
            // the error non-destructively via stderr + exit(1).
            try {
                await cli.run();
            } catch (e) {
                // swallow our synthetic exit
                if ((e as Error).message !== '__exit__') throw e;
            }
        } finally {
            process.argv = origArgv;
            process.stderr.write = origStderr as never;
            process.stdout.write = origStdout as never;
            console.log = origLog;
            process.exit = origExit;
        }
        expect(exitCode).toBe(1);
        expect(stderrOut).toContain('faker');
        expect(stderrOut).toContain('_other');
    });
});

describe('alias validation before codegen has run (#136)', () => {
    test('does not report unresolved generated-command aliases before `generate` has run', async () => {
        const workDir = join(tmpdir(), `apijack-alias-precodegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const cliConfigDir = join(workDir, '.testcli');
        mkdirSync(cliConfigDir, { recursive: true });
        // Points at an operation that would only exist once `generate` has run.
        writeFileSync(
            join(cliConfigDir, 'aliases.json'),
            JSON.stringify({ cs: 'customers list-customers' }),
        );

        const origArgv = process.argv;
        const origStderr = process.stderr.write.bind(process.stderr);
        const origStdout = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;
        let stderrOut = '';

        try {
            process.argv = ['node', 'testcli', 'config', 'list'];
            process.stderr.write = ((c: string | Uint8Array) => {
                stderrOut += String(c);

                return true;
            }) as never;
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            process.exit = (() => {
                throw new Error('__exit__');
            }) as never;

            const cli = createCli(makeOptions({
                configPath: join(cliConfigDir, 'config.json'),
                // No `generated/` at this path — the same state as a fresh
                // install where `generate` has not been run yet.
                generatedDir: join(workDir, 'src', 'generated'),
            }));

            try {
                await cli.run();
            } catch (e) {
                if ((e as Error).message !== '__exit__') throw e;
            }
        } finally {
            process.argv = origArgv;
            process.stderr.write = origStderr as never;
            process.stdout.write = origStdout as never;
            console.log = origLog;
            process.exit = origExit;
            rmSync(workDir, { recursive: true, force: true });
        }

        expect(stderrOut).not.toContain('does not resolve to a known command');
    });

    test('does not report unresolved generated-command aliases when codegen is partial (client exports no ApiClient) (#138)', async () => {
        const workDir = join(tmpdir(), `apijack-alias-partialcodegen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const cliConfigDir = join(workDir, '.testcli');
        const generatedDir = join(workDir, 'src', 'generated');
        mkdirSync(cliConfigDir, { recursive: true });
        mkdirSync(generatedDir, { recursive: true });
        // Points at an operation that would only exist once `generate` has fully run.
        writeFileSync(
            join(cliConfigDir, 'aliases.json'),
            JSON.stringify({ cs: 'customers list-customers' }),
        );
        // commandsModule exists (so `commandsModule` is truthy)...
        writeFileSync(
            join(generatedDir, 'commands.ts'),
            'export function registerGeneratedCommands(): void {}\n',
        );
        // ...but the client module imports cleanly without exporting `ApiClient`,
        // leaving `ApiClientClass` undefined and registration skipped.
        writeFileSync(join(generatedDir, 'client.ts'), 'export const somethingElse = 1;\n');

        const origArgv = process.argv;
        const origStderr = process.stderr.write.bind(process.stderr);
        const origStdout = process.stdout.write.bind(process.stdout);
        const origLog = console.log;
        const origExit = process.exit;
        let stderrOut = '';

        try {
            process.argv = ['node', 'testcli', 'config', 'list'];
            process.stderr.write = ((c: string | Uint8Array) => {
                stderrOut += String(c);

                return true;
            }) as never;
            process.stdout.write = (() => true) as never;
            console.log = () => {};
            process.exit = (() => {
                throw new Error('__exit__');
            }) as never;

            const cli = createCli(makeOptions({
                configPath: join(cliConfigDir, 'config.json'),
                generatedDir,
            }));

            try {
                await cli.run();
            } catch (e) {
                if ((e as Error).message !== '__exit__') throw e;
            }
        } finally {
            process.argv = origArgv;
            process.stderr.write = origStderr as never;
            process.stdout.write = origStdout as never;
            console.log = origLog;
            process.exit = origExit;
            rmSync(workDir, { recursive: true, force: true });
        }

        expect(stderrOut).not.toContain('does not resolve to a known command');
    });
});

describe('cli.runRoutine', () => {
    let tmpHome: string;
    let configPath: string;
    let cli: Cli;
    let originalHome: string | undefined;

    beforeEach(() => {
        tmpHome = join(tmpdir(), `runRoutine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const cliConfigDir = join(tmpHome, '.testcli');
        mkdirSync(join(cliConfigDir, 'routines'), { recursive: true });
        configPath = join(cliConfigDir, 'config.json');
        // Minimal env config so resolveAuth() returns something.
        writeFileSync(configPath, JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));
        // Write a minimal routine YAML.
        writeFileSync(join(cliConfigDir, 'routines', 'echo.yaml'),
            `name: echo
steps:
  - name: ping
    command: my-dispatch
    args:
      msg: hello
    output: result
`);

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;

        cli = createCli({ ...makeOptions(), configPath });
        cli.dispatcher('my-dispatch', async args => ({ echoed: args.msg }));
    });

    afterEach(() => {
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        rmSync(tmpHome, { recursive: true, force: true });
    });

    test('returns full RoutineResult shape on success', async () => {
        const result = await cli.runRoutine('echo');

        expect(result.status).toBe('ok');
        expect(result.success).toBe(true);
        expect(result.output).toEqual({ result: { echoed: 'hello' } });
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]!).toMatchObject({ name: 'ping', status: 'ok' });
        expect(typeof result.durationMs).toBe('number');
    });

    test('throws on missing routine', async () => {
        await expect(cli.runRoutine('does-not-exist')).rejects.toThrow();
    });

    test('is idempotent across repeated calls (no double-bootstrap)', async () => {
        const a = await cli.runRoutine('echo');
        const b = await cli.runRoutine('echo');
        expect(a.status).toBe('ok');
        expect(b.status).toBe('ok');
    });
});

describe('routine run flags (via cli.run)', () => {
    let tmpHome: string;
    let configPath: string;
    let originalHome: string | undefined;
    let dispatched: string[];

    beforeEach(() => {
        tmpHome = join(tmpdir(), `routineRunFlags-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const cliConfigDir = join(tmpHome, '.testcli');
        mkdirSync(join(cliConfigDir, 'routines'), { recursive: true });
        configPath = join(cliConfigDir, 'config.json');
        writeFileSync(configPath, JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));
        writeFileSync(join(cliConfigDir, 'routines', 'progress.yaml'),
            `name: progress
description: Prints deleted / total
steps:
  - name: total
    command: count
  - name: print
    command: print-progress
`);
        writeFileSync(join(cliConfigDir, 'routines', 'broken.yaml'),
            `name: broken
steps:
  - name: explode
    command: explode
`);

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;
        dispatched = [];
    });

    afterEach(() => {
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        rmSync(tmpHome, { recursive: true, force: true });
    });

    async function runCli(
        argv: string[],
        overrides: Partial<CliOptions> = {},
    ): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
        const cli = createCli(makeOptions({
            configPath,
            generatedDir: join(tmpHome, 'src', 'generated'),
            ...overrides,
        }));
        cli.dispatcher('count', async () => {
            dispatched.push('count');

            return 608206;
        });
        cli.dispatcher('print-progress', async () => {
            dispatched.push('print-progress');
            console.log('167446 / 608206');

            return null;
        });
        cli.dispatcher('explode', async () => {
            dispatched.push('explode');
            throw new Error('boom');
        });

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

    test.each([
        ['after the routine name', ['routine', 'run', 'progress', '--dry-run']],
        ['with --json', ['routine', 'run', 'progress', '--dry-run', '--json']],
        ['before the subcommand', ['--dry-run', 'routine', 'run', 'progress']],
    ])('--dry-run %s previews steps without dispatching, despite the program-level --dry-run', async (_label, argv) => {
        const { exitCode } = await runCli(argv);

        expect(dispatched).toEqual([]);
        expect(exitCode).toBeUndefined();
    });

    test.each([
        ['--quiet with the program-level --quiet registered', ['routine', 'run', 'progress', '--quiet'], ['json', 'table', 'quiet']],
        ['--quiet without the program-level --quiet', ['routine', 'run', 'progress', '--quiet'], ['json']],
        ['-s', ['routine', 'run', 'progress', '-s'], ['json', 'table', 'quiet']],
        ['program-level --quiet before the subcommand', ['--quiet', 'routine', 'run', 'progress'], ['json', 'table', 'quiet']],
    ])('%s prints only what the routine prints', async (_label, argv, outputModes) => {
        const { stdout, stderr, exitCode } = await runCli(argv, { outputModes });

        expect(dispatched).toEqual(['count', 'print-progress']);
        expect(stdout).toBe('167446 / 608206\n');
        expect(stderr).toBe('');
        expect(exitCode).toBeUndefined();
    });

    test('--quiet with --dry-run prints only the resolved commands', async () => {
        const { stdout, exitCode } = await runCli(['routine', 'run', 'progress', '--quiet', '--dry-run']);

        expect(dispatched).toEqual([]);
        expect(stdout).toBe('[1] total: count\n[2] print: print-progress\n');
        expect(exitCode).toBeUndefined();
    });

    test('--quiet reports a failing step on stderr and exits 1', async () => {
        const { stdout, stderr, exitCode } = await runCli(['routine', 'run', 'broken', '--quiet']);

        expect(dispatched).toEqual(['explode']);
        expect(stdout).toBe('');
        expect(stderr).toContain('Step "explode" failed: boom');
        expect(exitCode).toBe(1);
    });

    test('-s reports an unknown routine on stderr and exits 1', async () => {
        const { stdout, stderr, exitCode } = await runCli(['routine', 'run', 'nope', '-s']);

        expect(stdout).toBe('');
        expect(stderr).toContain('Routine not found: nope');
        expect(exitCode).toBe(1);
    });

    test.each([
        ['-s', ['json']],
        ['--quiet', ['json', 'table', 'quiet']],
    ])('%s combined with --json is rejected before running', async (flag, outputModes) => {
        const { stdout, stderr, exitCode } = await runCli(['routine', 'run', 'progress', flag, '--json'], { outputModes });

        expect(dispatched).toEqual([]);
        expect(stdout).toBe('');
        expect(stderr).toContain("cannot be used with option '--json'");
        expect(exitCode).toBe(1);
    });
});

describe('leading program options (via cli.run) (#181)', () => {
    let tmpHome: string;
    let cliConfigDir: string;
    let configPath: string;
    let generatedDir: string;
    let originalHome: string | undefined;
    let originalIsTTY: boolean | undefined;
    let dispatched: string[];

    beforeEach(() => {
        tmpHome = join(tmpdir(), `leadingOptions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        cliConfigDir = join(tmpHome, '.testcli');
        mkdirSync(join(cliConfigDir, 'routines'), { recursive: true });
        configPath = join(cliConfigDir, 'config.json');
        generatedDir = join(tmpHome, 'src', 'generated');

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;
        // The first-run setup wizard only opens on an interactive stdin.
        originalIsTTY = process.stdin.isTTY;
        (process.stdin as { isTTY?: boolean }).isTTY = true;
        dispatched = [];
    });

    afterEach(() => {
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        (process.stdin as { isTTY?: boolean }).isTTY = originalIsTTY;
        rmSync(tmpHome, { recursive: true, force: true });
    });

    function writeConfig(): void {
        writeFileSync(configPath, JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));
    }

    function writeAliases(aliases: Record<string, string>): void {
        writeFileSync(join(cliConfigDir, 'aliases.json'), JSON.stringify(aliases));
    }

    function writeProgressRoutine(): void {
        writeFileSync(join(cliConfigDir, 'routines', 'progress.yaml'),
            `name: progress
steps:
  - name: total
    command: count
`);
    }

    /** One generated API command group (`items`), so help output can show API commands. */
    function writeGeneratedCommands(): void {
        mkdirSync(generatedDir, { recursive: true });
        writeFileSync(
            join(generatedDir, 'commands.ts'),
            'export function registerGeneratedCommands(program: any): void {\n'
            + '    program.command("items").description("Items");\n'
            + '}\n',
        );
        writeFileSync(join(generatedDir, 'client.ts'), 'export class ApiClient {}\n');
    }

    async function runCli(
        argv: string[],
        configure?: (cli: Cli) => void,
        overrides: Partial<CliOptions> = {},
    ): Promise<{ stdout: string; stderr: string; exitCode: number | undefined; setupPrompted: boolean }> {
        const cli = createCli(makeOptions({ configPath, generatedDir, ...overrides }));
        cli.dispatcher('count', async () => {
            dispatched.push('count');

            return 1;
        });
        configure?.(cli);

        let stdout = '';
        let stderr = '';
        let exitCode: number | undefined;
        let setupPrompted = false;
        const origArgv = process.argv;
        const origLog = console.log;
        const origErr = console.error;
        const origStdout = process.stdout.write;
        const origStderr = process.stderr.write;
        const origExit = process.exit;

        try {
            process.argv = ['node', 'testcli', ...argv];
            console.log = (...args: unknown[]) => {
                const line = args.join(' ');

                // The wizard would block on stdin next — stop the run here instead.
                if (line.startsWith('testcli Setup')) {
                    setupPrompted = true;
                    throw new Error('__setup__');
                }

                stdout += line + '\n';
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
                const msg = (e as Error).message;

                if (msg !== '__exit__' && msg !== '__setup__') throw e;
            }
        } finally {
            process.argv = origArgv;
            console.log = origLog;
            console.error = origErr;
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
            process.exit = origExit;
        }

        return { stdout, stderr, exitCode, setupPrompted };
    }

    describe('first-run setup wizard (no config, interactive stdin)', () => {
        test.each([
            ['--quiet routine list', ['--quiet', 'routine', 'list'], 'No routines found'],
            ['--table config list', ['--table', 'config', 'list'], 'No environments configured'],
            ['-o json config list', ['-o', 'json', 'config', 'list'], 'No environments configured'],
            ['-ojson config list', ['-ojson', 'config', 'list'], 'No environments configured'],
            ['--dry-run routine list', ['--dry-run', 'routine', 'list'], 'No routines found'],
            ['-- routine list', ['--', 'routine', 'list'], 'No routines found'],
            ['help routine', ['help', 'routine'], 'Manage and run routines'],
            ['--quiet help routine', ['--quiet', 'help', 'routine'], 'Manage and run routines'],
        ])('%s runs the command without opening the wizard', async (_label, argv, expected) => {
            const { stdout, setupPrompted } = await runCli(argv);

            expect(setupPrompted).toBe(false);
            expect(stdout).toContain(expected);
        });

        test('--quiet --version prints the version without opening the wizard', async () => {
            const { stdout, setupPrompted, exitCode } = await runCli(['--quiet', '--version']);

            expect(setupPrompted).toBe(false);
            expect(stdout).toBe('1.0.0\n');
            expect(exitCode).toBe(0);
        });

        test('a leading option before a command that needs credentials still opens the wizard', async () => {
            const { setupPrompted } = await runCli(['--quiet', 'widgets', 'list']);

            expect(setupPrompted).toBe(true);
        });

        test('an alias after a leading option is resolved before the wizard check', async () => {
            writeAliases({ rl: 'routine list' });

            const { stdout, setupPrompted } = await runCli(['--quiet', 'rl']);

            expect(setupPrompted).toBe(false);
            expect(stdout).toContain('No routines found');
        });
    });

    test('--quiet plugins check reports plugin problems instead of throwing at startup', async () => {
        const { stderr, exitCode } = await runCli(['--quiet', 'plugins', 'check'], (cli) => {
            // Fails namespace validation, which startup would otherwise throw on.
            cli.use({ name: 'faker', resolvers: { _other: () => 'x' } });
        });

        expect(stderr).toContain('registered resolver "_other" which is outside its namespace');
        expect(exitCode).toBe(1);
    });

    describe('aliases after leading options', () => {
        beforeEach(() => {
            writeConfig();
        });

        test('a single-token alias resolves after a leading boolean option', async () => {
            writeAliases({ rl: 'routine list' });

            const { stdout, exitCode } = await runCli(['--quiet', 'rl']);

            expect(stdout).toContain('No routines found');
            expect(exitCode).toBeUndefined();
        });

        test('a multi-token alias resolves after a leading value option', async () => {
            writeAliases({ 'r ls': 'routine list' });

            const { stdout, exitCode } = await runCli(['-o', 'json', 'r', 'ls']);

            expect(stdout).toContain('No routines found');
            expect(exitCode).toBeUndefined();
        });

        test('the leading options still apply to the expanded command', async () => {
            writeAliases({ rr: 'routine run' });
            writeProgressRoutine();

            const { stdout, exitCode } = await runCli(['--dry-run', 'rr', 'progress']);

            // --dry-run kept in front of `routine run progress` → preview, no dispatch.
            expect(dispatched).toEqual([]);
            expect(stdout).toContain('[1] total: count');
            expect(exitCode).toBeUndefined();
        });
    });

    describe('help', () => {
        beforeEach(() => {
            writeConfig();
            writeGeneratedCommands();
        });

        test('--quiet --help shows the full custom help, like --help', async () => {
            const { stdout, exitCode } = await runCli(['--quiet', '--help']);

            expect(stdout).toContain('API Commands (1):');
            expect(stdout).toContain("Run 'testcli <command> --help' for details on any command.");
            expect(exitCode).toBe(0);
        });

        test('--quiet with no command shows the summary custom help, like no args', async () => {
            const { stdout, exitCode } = await runCli(['--quiet']);

            expect(stdout).toContain("1 API command groups available — run 'testcli --help' to list all");
            expect(exitCode).toBe(0);
        });

        test('an unknown leading option with no command is still rejected', async () => {
            const { stderr, exitCode } = await runCli(['--bogus']);

            expect(stderr).toContain("unknown option '--bogus'");
            expect(exitCode).toBe(1);
        });

        test('-o with no value and no command is still rejected', async () => {
            const { stderr, exitCode } = await runCli(['-o']);

            expect(stderr).toContain("option '-o <format>' argument missing");
            expect(exitCode).toBe(1);
        });

        test('a leading option this CLI did not register is still rejected', async () => {
            // Without the 'quiet' output mode, the program has no --quiet option.
            const { stderr, exitCode } = await runCli(['--quiet'], undefined, { outputModes: ['json'] });

            expect(stderr).toContain("unknown option '--quiet'");
            expect(exitCode).toBe(1);
        });
    });

    test('every program-level option createCli registers is scanned as a leading option', async () => {
        writeConfig();
        let program: Command | undefined;

        await runCli(['config', 'list'], (cli) => {
            cli.command('capture', (p) => {
                program = p;
            });
        });

        expect(program).toBeDefined();

        // Commander keeps the help option out of `program.options`;
        // `visibleOptions` adds it back.
        const registered = new Set([...program!.options, ...program!.createHelp().visibleOptions(program!)]);
        expect(registered.size).toBeGreaterThan(0);

        for (const opt of registered) {
            const takesValue = opt.required || opt.optional;

            for (const flag of [opt.short, opt.long].filter((f): f is string => !!f)) {
                const scan = scanLeadingOptions([flag, 'x', 'cmd']);

                expect({ flag, known: scan.options[0]?.known, rest: scan.rest }).toEqual({
                    flag,
                    known: true,
                    rest: takesValue ? ['cmd'] : ['x', 'cmd'],
                });
            }
        }
    });
});

describe('global --config <name> (via cli.run) (#180)', () => {
    const DEV_URL = 'http://dev.example.test';
    const COOLSILK_URL = 'http://coolsilk.example.test';
    let tmpHome: string;
    let cliConfigDir: string;
    let configPath: string;
    let generatedDir: string;
    let originalHome: string | undefined;
    let originalIsTTY: boolean | undefined;
    let originalFetch: typeof fetch;

    beforeEach(() => {
        tmpHome = join(tmpdir(), `configFlag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        cliConfigDir = join(tmpHome, '.testcli');
        mkdirSync(join(cliConfigDir, 'routines'), { recursive: true });
        configPath = join(cliConfigDir, 'config.json');
        generatedDir = join(tmpHome, 'src', 'generated');
        writeFileSync(configPath, JSON.stringify({
            active: 'dev',
            environments: {
                dev: { url: DEV_URL, user: 'devuser', password: 'devpass' },
                coolsilk: {
                    url: COOLSILK_URL,
                    user: 'csuser',
                    password: 'cspass',
                    sessionAuth: { session: { endpoint: '/coolsilk-session' } },
                },
            },
        }));

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;
        originalIsTTY = process.stdin.isTTY;
        (process.stdin as { isTTY?: boolean }).isTTY = true;
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        (process.stdin as { isTTY?: boolean }).isTTY = originalIsTTY;
        globalThis.fetch = originalFetch;
        delete process.env.TESTCLI_URL;
        delete process.env.TESTCLI_USER;
        delete process.env.TESTCLI_PASS;
        rmSync(tmpHome, { recursive: true, force: true });
    });

    function activeEnvironment(): string {
        return (JSON.parse(readFileSync(configPath, 'utf-8')) as { active: string }).active;
    }

    function sessionFile(env: string): string {
        return join(cliConfigDir, 'sessions', `${env}.json`);
    }

    /** A consumer command that prints the base URL of the environment it got. */
    function registerWhoami(cli: Cli, requiresAuth = false): void {
        cli.command('whoami', (program, ctx) => {
            program.command('whoami').action(() => {
                console.log(`url=${ctx.auth.baseUrl}`);
            });
        }, { requiresAuth });
    }

    /** A generated `described create-item` command with its own --config flag. */
    function writeGeneratedCommands(): void {
        mkdirSync(generatedDir, { recursive: true });
        writeFileSync(
            join(generatedDir, 'commands.ts'),
            'export function registerGeneratedCommands(program: any, client: any): void {\n'
            + '    program.command("described").command("create-item")\n'
            + '        .option("--config <value>", "Configuration settings")\n'
            + '        .action((opts: any) => { console.log(`config=${opts.config} url=${client.baseUrl}`); });\n'
            + '}\n',
        );
        writeFileSync(
            join(generatedDir, 'client.ts'),
            'export class ApiClient { constructor(public baseUrl: string) {} }\n',
        );
    }

    async function runCli(
        argv: string[],
        configure?: (cli: Cli) => void,
        overrides: Partial<CliOptions> = {},
    ): Promise<{ stdout: string; stderr: string; exitCode: number | undefined; setupPrompted: boolean }> {
        const cli = createCli(makeOptions({ configPath, generatedDir, ...overrides }));
        configure?.(cli);

        let stdout = '';
        let stderr = '';
        let exitCode: number | undefined;
        let setupPrompted = false;
        const origArgv = process.argv;
        const origLog = console.log;
        const origErr = console.error;
        const origStdout = process.stdout.write;
        const origStderr = process.stderr.write;
        const origExit = process.exit;

        try {
            process.argv = ['node', 'testcli', ...argv];
            console.log = (...args: unknown[]) => {
                const line = args.join(' ');

                // The wizard would block on stdin next — stop the run here instead.
                if (line.startsWith('testcli Setup')) {
                    setupPrompted = true;
                    throw new Error('__setup__');
                }

                stdout += line + '\n';
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
                const msg = (e as Error).message;

                if (msg !== '__exit__' && msg !== '__setup__') throw e;
            }
        } finally {
            process.argv = origArgv;
            console.log = origLog;
            console.error = origErr;
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
            process.exit = origExit;
        }

        return { stdout, stderr, exitCode, setupPrompted };
    }

    test.each([
        ['--config <name>', ['--config', 'coolsilk', 'whoami']],
        ['--config=<name>', ['--config=coolsilk', 'whoami']],
        ['--config after another leading option', ['--quiet', '--config', 'coolsilk', 'whoami']],
        ['--config before another leading option', ['--config', 'coolsilk', '-o', 'json', 'whoami']],
    ])('%s runs the command against that environment', async (_label, argv) => {
        const { stdout, exitCode } = await runCli(argv, cli => registerWhoami(cli));

        expect(stdout).toBe(`url=${COOLSILK_URL}\n`);
        expect(exitCode).toBeUndefined();
    });

    test('CliOptions.environment selects the environment without a flag', async () => {
        const { stdout } = await runCli(['whoami'], cli => registerWhoami(cli), { environment: 'coolsilk' });

        expect(stdout).toBe(`url=${COOLSILK_URL}\n`);
    });

    test('a leading --config wins over CliOptions.environment', async () => {
        const { stdout } = await runCli(['--config', 'dev', 'whoami'], cli => registerWhoami(cli), { environment: 'coolsilk' });

        expect(stdout).toBe(`url=${DEV_URL}\n`);
    });

    test('without --config the active environment is used', async () => {
        const { stdout } = await runCli(['whoami'], cli => registerWhoami(cli));

        expect(stdout).toBe(`url=${DEV_URL}\n`);
    });

    test('--config leaves the active environment unchanged', async () => {
        await runCli(['--config', 'coolsilk', 'whoami'], cli => registerWhoami(cli));

        expect(activeEnvironment()).toBe('dev');
    });

    test('--config wins over the <CLI>_URL / _USER / _PASS env vars', async () => {
        process.env.TESTCLI_URL = 'http://envvars.example.test';
        process.env.TESTCLI_USER = 'envuser';
        process.env.TESTCLI_PASS = 'envpass';

        const withoutFlag = await runCli(['whoami'], cli => registerWhoami(cli));
        const withFlag = await runCli(['--config', 'coolsilk', 'whoami'], cli => registerWhoami(cli));

        expect(withoutFlag.stdout).toBe('url=http://envvars.example.test\n');
        expect(withFlag.stdout).toBe(`url=${COOLSILK_URL}\n`);
    });

    test('an unknown name fails with the configured environments, before running anything', async () => {
        const { stdout, stderr, exitCode } = await runCli(['--config', 'nope', 'whoami'], cli => registerWhoami(cli));

        expect(stderr).toContain("Environment 'nope' not found. Available: dev, coolsilk");
        expect(stdout).toBe('');
        expect(exitCode).toBe(1);
    });

    test('an unknown name with no config.json fails instead of opening the setup wizard', async () => {
        rmSync(configPath);

        const { stderr, exitCode, setupPrompted } = await runCli(['--config', 'nope', 'widgets', 'list']);

        expect(setupPrompted).toBe(false);
        expect(stderr).toContain("Environment 'nope' not found. Available: none");
        expect(exitCode).toBe(1);
    });

    test('--config with no value is rejected', async () => {
        const { stderr, exitCode } = await runCli(['--config']);

        expect(stderr).toContain("option '--config <name>' argument missing");
        expect(exitCode).toBe(1);
    });

    test('an existing session file of the active environment is left untouched', async () => {
        SessionManager.forEnvironment(cliConfigDir, { env: 'dev', baseUrl: DEV_URL, username: 'devuser' })
            .save({ headers: { 'X-Dev': 'kept' } });
        const before = readFileSync(sessionFile('dev'), 'utf-8');

        await runCli(['--config', 'coolsilk', 'whoami'], cli => registerWhoami(cli, true), {
            auth: {
                authenticate: async () => ({ headers: { 'X-Test': '1' } }),
                restore: async cached => cached,
            },
        });

        expect(readFileSync(sessionFile('dev'), 'utf-8')).toBe(before);
        expect(existsSync(sessionFile('coolsilk'))).toBe(true);
    });

    test('config update-password defaults to the selected environment', async () => {
        writeFileSync(configPath, JSON.stringify({
            active: 'dev',
            environments: {
                dev: { url: 'http://localhost:8080', user: 'devuser', password: 'old-dev' },
                local2: { url: 'http://localhost:8181', user: 'l2user', password: 'old-l2' },
            },
        }));

        const { stdout } = await runCli(['--config', 'local2', 'config', 'update-password', '--password', 'new-l2'], undefined, {
            knownSites: {},
        });

        const saved = JSON.parse(readFileSync(configPath, 'utf-8')) as {
            active: string;
            environments: Record<string, { password: string }>;
        };
        expect(stdout).toContain("Updating password for 'local2'");
        expect(saved.environments.local2.password).toBe('new-l2');
        expect(saved.environments.dev.password).toBe('old-dev');
    });

    test('the session is resolved into that environment\'s session file only', async () => {
        await runCli(['--config', 'coolsilk', 'whoami'], cli => registerWhoami(cli, true), {
            auth: {
                authenticate: async () => ({ headers: { 'X-Test': '1' } }),
                restore: async cached => cached,
            },
        });

        expect(existsSync(sessionFile('coolsilk'))).toBe(true);
        expect(existsSync(sessionFile('dev'))).toBe(false);
    });

    test('the selected environment\'s sessionAuth drives the handshake', async () => {
        const fetched: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            fetched.push(String(url));

            return new Response('', { status: 200 });
        }) as typeof fetch;

        await runCli(['--config', 'coolsilk', 'whoami'], cli => registerWhoami(cli, true), {
            sessionAuth: { session: { endpoint: '/session' }, cookies: { extract: ['SESSION'], applyTo: ['POST'] } },
        });

        expect(fetched).toEqual([`${COOLSILK_URL}/coolsilk-session`]);
    });

    test('routine run uses the environment for every step, including sub-routines', async () => {
        writeFileSync(join(cliConfigDir, 'routines', 'outer.yaml'), `name: outer
steps:
  - name: here
    command: where
  - name: nested
    command: routine run
    args-positional:
      - inner
`);
        writeFileSync(join(cliConfigDir, 'routines', 'inner.yaml'), `name: inner
steps:
  - name: there
    command: where
`);

        const { stdout, exitCode } = await runCli(['--config', 'coolsilk', 'routine', 'run', 'outer', '-s'], (cli) => {
            cli.dispatcher('where', async (_args, _positional, ctx) => {
                console.log(ctx.auth.baseUrl);

                return null;
            });
        });

        expect(stdout).toBe(`${COOLSILK_URL}\n${COOLSILK_URL}\n`);
        expect(exitCode).toBeUndefined();
    });

    test('config clear-session defaults to the selected environment', async () => {
        for (const env of ['dev', 'coolsilk']) {
            SessionManager.forEnvironment(cliConfigDir, { env, baseUrl: 'x', username: 'y' }).save({ headers: {} });
        }

        const { stdout } = await runCli(['--config', 'coolsilk', 'config', 'clear-session']);

        expect(stdout).toContain("Cleared the session for 'coolsilk'.");
        expect(existsSync(sessionFile('coolsilk'))).toBe(false);
        expect(existsSync(sessionFile('dev'))).toBe(true);
    });

    test('generate fetches the spec from the selected environment', async () => {
        const fetched: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            fetched.push(String(url));
            throw new Error('offline');
        }) as typeof fetch;

        const { stdout } = await runCli(['--config', 'coolsilk', 'generate']);

        expect(stdout).toContain(`Generating from ${COOLSILK_URL} ...`);
        expect(fetched.every(url => url.startsWith(COOLSILK_URL))).toBe(true);
        expect(fetched.length).toBeGreaterThan(0);
    });

    describe('a generated command with its own --config', () => {
        beforeEach(() => {
            writeGeneratedCommands();
        });

        test('keeps its flag when there is no global --config', async () => {
            const { stdout } = await runCli(['described', 'create-item', '--config', '{"a":1}']);

            expect(stdout).toBe(`config={"a":1} url=${DEV_URL}\n`);
        });

        test('keeps its flag after a leading global --config', async () => {
            const { stdout } = await runCli(['--config', 'coolsilk', 'described', 'create-item', '--config', '{"a":1}']);

            expect(stdout).toBe(`config={"a":1} url=${COOLSILK_URL}\n`);
        });
    });

    test('the hint is only for --config itself, not a longer unknown flag', async () => {
        const { stderr, exitCode } = await runCli(['routine', 'list', '--configuration', 'x']);

        expect(stderr).toContain("unknown option '--configuration'");
        expect(stderr).not.toContain('goes before the command');
        expect(exitCode).toBe(1);
    });

    test('a --config=<name> after a command that has none also gets the hint', async () => {
        const { stderr } = await runCli(['routine', 'list', '--config=coolsilk']);

        expect(stderr).toContain('--config <name> goes before the command');
    });

    test('a --config after a command that has none points at the leading position', async () => {
        const { stderr, exitCode } = await runCli(['routine', 'list', '--config', 'coolsilk']);

        expect(stderr).toContain("unknown option '--config'");
        expect(stderr).toContain('--config <name> goes before the command: testcli --config <name> <command>');
        expect(exitCode).toBe(1);
    });

    test('Commander\'s help command lists --config <name> too', async () => {
        const { stdout } = await runCli(['help']);

        expect(stdout).toContain('--config <name>');
    });

    test('--help lists --config <name>', async () => {
        const { stdout } = await runCli(['--help']);

        expect(stdout).toMatch(/^ {2}--config <name> +Use this configured environment instead of the active one$/m);
    });

    test('--config with no command shows the custom help', async () => {
        const { stdout, exitCode } = await runCli(['--config', 'coolsilk']);

        expect(stdout).toContain("Run 'testcli <command> --help' for details on any command.");
        expect(exitCode).toBe(0);
    });
});
