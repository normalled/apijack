import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Global --config <name> through the shared binary (#180). bin/apijack.ts picks
// the generated code, auth type and sessionAuth before createCli runs, so these
// run the real binary in a subprocess.

const repoRoot = join(import.meta.dir, '..');
const binPath = join(repoRoot, 'bin', 'apijack.ts');
const workDir = join(tmpdir(), `apijack-config-flag-${Date.now()}-${process.pid}`);

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

async function runBin(args: string[], opts: { cwd: string; home: string }): Promise<RunResult> {
    const env: Record<string, string | undefined> = { ...process.env, HOME: opts.home, APIJACK_SKIP_UPDATE: '1' };
    delete env.APIJACK_URL;
    delete env.APIJACK_USER;
    delete env.APIJACK_PASS;

    const proc = Bun.spawn([process.execPath, binPath, ...args], {
        cwd: opts.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
}

interface ToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * Start `apijack <args> mcp`-style server, run the tool calls over stdio JSON-RPC
 * and return each call's first text content, in order.
 */
async function callMcpTools(args: string[], opts: { cwd: string; home: string }, calls: ToolCall[]): Promise<string[]> {
    const env: Record<string, string | undefined> = { ...process.env, HOME: opts.home, APIJACK_SKIP_UPDATE: '1' };
    delete env.APIJACK_URL;
    delete env.APIJACK_USER;
    delete env.APIJACK_PASS;

    const proc = Bun.spawn([process.execPath, binPath, ...args], {
        cwd: opts.cwd,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    });
    const send = (message: object) => {
        proc.stdin.write(JSON.stringify(message) + '\n');
        proc.stdin.flush();
    };
    const responses = new Map<number, { result?: { content: { text: string }[] } }>();
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const timeout = setTimeout(() => proc.kill(), 20_000);
    let buffered = '';

    send({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });

    try {
        while (responses.size < calls.length + 1) {
            const { done, value } = await reader.read();

            if (done) break;

            buffered += decoder.decode(value, { stream: true });
            let newline: number;

            while ((newline = buffered.indexOf('\n')) >= 0) {
                const line = buffered.slice(0, newline).trim();
                buffered = buffered.slice(newline + 1);

                if (!line) continue;

                const message = JSON.parse(line) as { id?: number; result?: { content: { text: string }[] } };

                if (message.id === undefined) continue;

                responses.set(message.id, message);

                if (message.id === 0) {
                    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                    calls.forEach((call, i) => send({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: call }));
                }
            }
        }
    } finally {
        clearTimeout(timeout);
        proc.kill();
    }

    return calls.map((_call, i) => responses.get(i + 1)?.result?.content[0]?.text ?? '<no response>');
}

/** Generated code whose `probe` command reports which environment's code ran and what it would send. */
function writeProbeGenerated(dir: string, mark: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'commands.ts'),
        'export function registerGeneratedCommands(program: any, client: any): void {\n'
        + '    program.command("probe").action(async () => {\n'
        + '        await client.ensureReady();\n'
        + `        console.log("MARK=${mark} URL=" + client.baseUrl + " HEADERS=" + JSON.stringify(client.getHeaders("GET")));\n`
        + '    });\n'
        + '}\n',
    );
    writeFileSync(
        join(dir, 'client.ts'),
        'export class ApiClient {\n'
        + '    constructor(public baseUrl: string, public getHeaders: (method: string) => Record<string, string>) {}\n'
        + '}\n',
    );
}

describe('bin/apijack.ts --config <name> in global mode', () => {
    const home = join(workDir, 'global-home');
    const cwd = join(workDir, 'global-cwd');
    const apijackDir = join(home, '.apijack');
    const handshakes: string[] = [];
    let server: ReturnType<typeof Bun.serve>;
    let remoteUrl: string;

    beforeAll(() => {
        // The remote environment's session handshake lands here.
        server = Bun.serve({
            port: 0,
            fetch(req) {
                handshakes.push(`${new URL(req.url).pathname} key=${req.headers.get('x-api-key')}`);

                return new Response('', { status: 200, headers: { 'Set-Cookie': 'SESSION=abc' } });
            },
        });
        remoteUrl = `http://127.0.0.1:${server.port}`;

        mkdirSync(cwd, { recursive: true });
        mkdirSync(apijackDir, { recursive: true });
        writeFileSync(join(apijackDir, 'config.json'), JSON.stringify({
            active: 'dev',
            environments: {
                dev: { url: 'http://dev.example.test', user: 'devuser', password: 'devpass' },
                remote: {
                    url: remoteUrl,
                    user: 'remoteuser',
                    password: 'unused',
                    authType: 'apiKey',
                    authHeader: 'X-Api-Key',
                    apiKey: 'REMOTE_KEY',
                    sessionAuth: {
                        session: { endpoint: '/remote-session' },
                        cookies: { extract: ['SESSION'], applyTo: ['GET'] },
                    },
                },
            },
        }));
        // Global mode keeps generated code per hostname.
        writeProbeGenerated(join(apijackDir, 'apis', 'dev.example.test', 'generated'), 'dev');
        writeProbeGenerated(join(apijackDir, 'apis', '127.0.0.1', 'generated'), 'remote');
    });

    afterAll(() => {
        server.stop(true);
    });

    test('without --config the active environment\'s code and credentials are used', async () => {
        const result = await runBin(['probe'], { cwd, home });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`MARK=dev URL=http://dev.example.test HEADERS={"Authorization":"Basic ${btoa('devuser:devpass')}"}`);
    });

    test('--config loads the named environment\'s code, auth type and sessionAuth', async () => {
        handshakes.length = 0;
        rmSync(join(apijackDir, 'sessions'), { recursive: true, force: true });

        const result = await runBin(['--config', 'remote', 'probe'], { cwd, home });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`MARK=remote URL=${remoteUrl} HEADERS={"X-Api-Key":"REMOTE_KEY","Cookie":"SESSION=abc"}`);
        expect(handshakes).toEqual(['/remote-session key=REMOTE_KEY']);
        expect(existsSync(join(apijackDir, 'sessions', 'remote.json'))).toBe(true);
        expect(existsSync(join(apijackDir, 'sessions', 'dev.json'))).toBe(false);
        expect(JSON.parse(readFileSync(join(apijackDir, 'config.json'), 'utf-8')).active).toBe('dev');
    });

    test('an unknown name fails with the configured environments', async () => {
        const result = await runBin(['--config', 'nope', 'probe'], { cwd, home });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Environment 'nope' not found. Available: dev, remote");
    });

    test('--config <name> mcp pins the server\'s commands and get_config to that environment', async () => {
        const [probe, config] = await callMcpTools(['--config', 'remote', 'mcp'], { cwd, home }, [
            { name: 'run_commands', arguments: { commands: [{ command: 'probe' }] } },
            { name: 'get_config', arguments: {} },
        ]);

        expect(probe).toContain(`MARK=remote URL=${remoteUrl}`);
        expect(JSON.parse(config!).url).toBe(remoteUrl);
    }, 30_000);
});

describe('bin/apijack.ts --config <name> in project mode', () => {
    const home = join(workDir, 'project-home');
    const projectDir = join(workDir, 'project');

    beforeAll(() => {
        mkdirSync(home, { recursive: true });
        mkdirSync(join(projectDir, '.apijack'), { recursive: true });
        writeFileSync(join(projectDir, '.apijack.json'), JSON.stringify({ name: 'proj' }));
        writeFileSync(join(projectDir, '.apijack', 'config.json'), JSON.stringify({
            active: 'dev',
            environments: {
                dev: { url: 'http://dev.example.test', user: 'devuser', password: 'devpass' },
                staging: { url: 'http://staging.example.test', user: 'stageuser', password: 'stagepass' },
            },
        }));
        writeProbeGenerated(join(projectDir, '.apijack', 'generated'), 'project');
    });

    test('--config runs the project\'s command against the named environment', async () => {
        const result = await runBin(['--config', 'staging', 'probe'], { cwd: projectDir, home });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`MARK=project URL=http://staging.example.test HEADERS={"Authorization":"Basic ${btoa('stageuser:stagepass')}"}`);
        expect(existsSync(join(projectDir, '.apijack', 'sessions', 'staging.json'))).toBe(true);
    });
});

afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
});
