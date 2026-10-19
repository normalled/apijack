import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Command } from 'commander';
import { createCli, type Cli } from '../src/cli-builder';
import { BasicAuthStrategy } from '../src/auth/basic';
import { generateClient } from '../src/codegen/client';
import { generateCommands } from '../src/codegen/commands';
import { generateCommandMap } from '../src/codegen/command-map';
import type { OpenApiOperation } from '../src/codegen/openapi-types';

/**
 * Request-preview modes (`-o curl`, `-o curl-with-creds`, `-o routine-step`)
 * through `createCli().run()` with real generated commands and client (#184).
 * The attached (`-ocurl`) and `=` (`-o=curl`) forms must preview exactly like
 * the spaced form — no request may reach the network.
 */

const PATHS: Record<string, Record<string, OpenApiOperation>> = {
    '/pets': {
        get: { operationId: 'listPets', tags: ['pets'] },
        post: {
            operationId: 'createPet',
            tags: ['pets'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                },
            },
        },
    },
    '/pets/{id}': {
        delete: {
            operationId: 'deletePet',
            tags: ['pets'],
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        },
    },
};

const LIST_CURL = 'curl \'http://localhost:9999/pets\'';
const DELETE_CURL = 'curl -X DELETE \'http://localhost:9999/pets/7\'';
const CREATE_CURL = 'curl -X POST \'http://localhost:9999/pets\'';
// btoa('u:p') — the configured environment's credentials.
const CREDS_HEADER = '-H \'Authorization: Basic dTpw\'';
const CREATE_STEP = '  command: pets create\n  args:\n    --name: "x"';

describe('request-preview -o forms (via cli.run) (#184)', () => {
    let tmpHome: string;
    let configPath: string;
    let generatedDir: string;
    let originalHome: string | undefined;
    let originalFetch: typeof globalThis.fetch;
    let requests: string[];

    beforeEach(() => {
        tmpHome = join(tmpdir(), `requestPreview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const cliConfigDir = join(tmpHome, '.testcli');
        mkdirSync(cliConfigDir, { recursive: true });
        configPath = join(cliConfigDir, 'config.json');
        writeFileSync(configPath, JSON.stringify({
            active: 'default',
            environments: {
                default: { url: 'http://localhost:9999', user: 'u', password: 'p' },
            },
        }));

        generatedDir = join(tmpHome, 'src', 'generated');
        mkdirSync(generatedDir, { recursive: true });
        writeFileSync(join(generatedDir, 'client.ts'), generateClient(PATHS));
        writeFileSync(join(generatedDir, 'commands.ts'), generateCommands(PATHS));
        writeFileSync(join(generatedDir, 'command-map.ts'), generateCommandMap(PATHS));

        originalHome = process.env.HOME;
        process.env.HOME = tmpHome;

        requests = [];
        originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string'
                ? url
                : url instanceof URL ? url.toString() : url.url;
            requests.push(`${init?.method ?? 'GET'} ${urlStr}`);

            return new Response(JSON.stringify({ id: 1 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;

        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;

        rmSync(tmpHome, { recursive: true, force: true });
    });

    async function runCli(
        argv: string[],
        configure?: (cli: Cli) => void,
    ): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
        const cli = createCli({
            name: 'testcli',
            description: 'A test CLI',
            version: '1.0.0',
            specPath: '/v3/api-docs',
            auth: new BasicAuthStrategy(),
            outputModes: ['json', 'table', 'quiet'],
            configPath,
            generatedDir,
        });
        configure?.(cli);

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
        ['pets list -o curl', ['pets', 'list', '-o', 'curl'], [LIST_CURL]],
        ['pets list -ocurl', ['pets', 'list', '-ocurl'], [LIST_CURL]],
        ['-ocurl pets list', ['-ocurl', 'pets', 'list'], [LIST_CURL]],
        ['pets list -o=curl', ['pets', 'list', '-o=curl'], [LIST_CURL]],
        ['-o=curl pets list', ['-o=curl', 'pets', 'list'], [LIST_CURL]],
        ['pets delete 7 -o curl', ['pets', 'delete', '7', '-o', 'curl'], [DELETE_CURL]],
        ['pets delete 7 -ocurl', ['pets', 'delete', '7', '-ocurl'], [DELETE_CURL]],
        ['pets create --name x -ocurl', ['pets', 'create', '--name', 'x', '-ocurl'], [CREATE_CURL, '-d \'{"name":"x"}\'']],
        ['pets delete 7 -o curl-with-creds', ['pets', 'delete', '7', '-o', 'curl-with-creds'], [DELETE_CURL, CREDS_HEADER]],
        ['pets delete 7 -ocurl-with-creds', ['pets', 'delete', '7', '-ocurl-with-creds'], [DELETE_CURL, CREDS_HEADER]],
        ['-ocurl-with-creds pets delete 7', ['-ocurl-with-creds', 'pets', 'delete', '7'], [DELETE_CURL, CREDS_HEADER]],
        ['pets delete 7 -o=curl-with-creds', ['pets', 'delete', '7', '-o=curl-with-creds'], [DELETE_CURL, CREDS_HEADER]],
        ['-o=curl-with-creds pets delete 7', ['-o=curl-with-creds', 'pets', 'delete', '7'], [DELETE_CURL, CREDS_HEADER]],
        ['the last -o wins: -o json -o curl', ['pets', 'list', '-o', 'json', '-o', 'curl'], [LIST_CURL]],
    ])('%s prints the curl preview without sending the request', async (_label, argv, expected) => {
        const { stdout, exitCode } = await runCli(argv);

        expect(requests).toEqual([]);
        expect(exitCode).toBeUndefined();

        for (const fragment of expected) expect(stdout).toContain(fragment);
    });

    test('-ocurl leaves the Authorization header out of the preview', async () => {
        const { stdout } = await runCli(['pets', 'delete', '7', '-ocurl']);

        expect(requests).toEqual([]);
        expect(stdout).not.toContain('Authorization');
    });

    test.each([
        ['pets create --name x -o routine-step', ['pets', 'create', '--name', 'x', '-o', 'routine-step']],
        ['pets create --name x -oroutine-step', ['pets', 'create', '--name', 'x', '-oroutine-step']],
        ['-oroutine-step pets create --name x', ['-oroutine-step', 'pets', 'create', '--name', 'x']],
        ['pets create --name x -o=routine-step', ['pets', 'create', '--name', 'x', '-o=routine-step']],
        ['-o=routine-step pets create --name x', ['-o=routine-step', 'pets', 'create', '--name', 'x']],
    ])('%s prints the routine step without sending the request', async (_label, argv) => {
        const { stdout, exitCode } = await runCli(argv);

        expect(requests).toEqual([]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain(CREATE_STEP);
    });

    test.each([
        ['pets list', ['pets', 'list']],
        ['the last -o wins: -o curl -o json', ['pets', 'list', '-o', 'curl', '-o', 'json']],
    ])('%s sends the request', async (_label, argv) => {
        const { stdout } = await runCli(argv);

        expect(requests).toEqual(['GET http://localhost:9999/pets']);
        expect(stdout).not.toContain('curl');
    });

    test.each([
        ['-vocurl', ['pets', 'list', '-vocurl'], 'curl'],
        ['-vo curl', ['pets', 'list', '-vo', 'curl'], 'curl'],
        ['-voroutine-step', ['pets', 'create', '--name', 'x', '-voroutine-step'], 'routine-step'],
    ])('%s (combined with a consumer-registered program flag) errors instead of sending the request', async (_label, argv, mode) => {
        // Commander reads `-o` out of the combined group, but the pre-parse
        // lookup can't know `-v` is a boolean, so the preview isn't installed.
        const { stderr, exitCode } = await runCli(argv, (cli) => {
            cli.command('verbose', (program) => {
                program.option('-v, --verbose', 'Verbose output');
            });
        });

        expect(requests).toEqual([]);
        expect(exitCode).toBe(1);
        expect(stderr).toContain(`"-o ${mode}"`);
    });

    test('-o=json leaves program.opts().o as json, like -o json', async () => {
        let program: Command | undefined;

        await runCli(['pets', 'list', '-o=json'], (cli) => {
            cli.command('capture', (p) => {
                program = p;
            });
        });

        expect(program).toBeDefined();
        expect(program!.opts().o).toBe('json');
    });
});
