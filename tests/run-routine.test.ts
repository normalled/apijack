import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runRoutine } from '../src/run-routine';

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

    test('respects explicit cwd option', async () => {
        const result = await runRoutine('echo', { cwd: projectDir });
        expect(result.status).toBe('ok');
    });
});
