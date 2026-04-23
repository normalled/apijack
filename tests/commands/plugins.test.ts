import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Command } from 'commander';
import { registerPluginsCommand } from '../../src/commands/plugins/register';
import { PluginRegistry } from '../../src/plugin/registry';

describe('plugins list', () => {
    let stdoutOut: string;
    let origStdoutWrite: typeof process.stdout.write;

    beforeEach(() => {
        stdoutOut = '';
        origStdoutWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdoutOut += String(chunk);

            return true;
        }) as never;
    });

    afterEach(() => {
        process.stdout.write = origStdoutWrite as never;
    });

    test('prints table with registered plugins', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'faker', version: '1.0.0' });
        registry.register({ name: 'dayjs', version: '0.9.0' });
        registerPluginsCommand(program, registry, '1.9.0');
        await program.parseAsync(['plugins', 'list'], { from: 'user' });
        expect(stdoutOut).toContain('faker');
        expect(stdoutOut).toContain('1.0.0');
        expect(stdoutOut).toContain('dayjs');
        expect(stdoutOut).toContain('0.9.0');
        expect(stdoutOut).toContain('PEER');
    });

    test('prints "no plugins registered" when registry is empty', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registerPluginsCommand(program, registry, '1.9.0');
        await program.parseAsync(['plugins', 'list'], { from: 'user' });
        expect(stdoutOut).toMatch(/no plugins/i);
    });

    test('handles plugin with no version field', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'noversion' });
        registerPluginsCommand(program, registry, '1.9.0');
        await program.parseAsync(['plugins', 'list'], { from: 'user' });
        expect(stdoutOut).toContain('noversion');
        // Should show a dash or "—" for missing version, not "undefined"
        expect(stdoutOut).not.toContain('undefined');
    });

    test('plugins without __package show "-" in PEER column', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'faker', version: '1.0.0' });
        registerPluginsCommand(program, registry, '1.9.0');
        await program.parseAsync(['plugins', 'list'], { from: 'user' });
        const lines = stdoutOut.split('\n');
        const fakerLine = lines.find(l => l.includes('faker'));
        expect(fakerLine).toBeDefined();
        // Row shape: NAME  VERSION  PEER  STATUS — expect a bare "-" between version and "ok"
        expect(fakerLine).toMatch(/faker\s+1\.0\.0\s+-\s+ok/);
    });
});

describe('plugins check', () => {
    let stdoutOut: string;
    let stderrOut: string;
    let exitCode: number | null;
    let origStdoutWrite: typeof process.stdout.write;
    let origStderrWrite: typeof process.stderr.write;
    let origExit: typeof process.exit;

    beforeEach(() => {
        stdoutOut = '';
        stderrOut = '';
        exitCode = null;
        origStdoutWrite = process.stdout.write.bind(process.stdout);
        origStderrWrite = process.stderr.write.bind(process.stderr);
        origExit = process.exit.bind(process);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdoutOut += String(chunk);

            return true;
        }) as never;
        process.stderr.write = ((chunk: string | Uint8Array) => {
            stderrOut += String(chunk);

            return true;
        }) as never;
        process.exit = ((code?: number) => {
            exitCode = code ?? 0;
            throw new Error('__exit__');
        }) as never;
    });

    afterEach(() => {
        process.stdout.write = origStdoutWrite as never;
        process.stderr.write = origStderrWrite as never;
        process.exit = origExit;
    });

    test('exits 0 when all plugins validate', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'faker', resolvers: { _faker: () => 'x' } });
        registerPluginsCommand(program, registry, '1.9.0');
        try {
            await program.parseAsync(['plugins', 'check'], { from: 'user' });
        } catch (e) {
            // swallow our synthetic exit
            if ((e as Error).message !== '__exit__') throw e;
        }
        expect(exitCode).toBe(0);
        expect(stdoutOut).toMatch(/all.*ok/i);
    });

    test('exits 1 and prints failing plugin on namespace violation', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'faker', resolvers: { _stranger: () => 'x' } });
        registerPluginsCommand(program, registry, '1.9.0');
        try {
            await program.parseAsync(['plugins', 'check'], { from: 'user' });
        } catch (e) {
            if ((e as Error).message !== '__exit__') throw e;
        }
        expect(exitCode).toBe(1);
        expect(stderrOut).toContain('faker');
        expect(stderrOut).toContain('_stranger');
    });

    test('exits 1 on collision with core built-in', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registry.register({ name: 'uuid', resolvers: { _uuid: () => 'collision' } });
        registerPluginsCommand(program, registry, '1.9.0');
        try {
            await program.parseAsync(['plugins', 'check'], { from: 'user' });
        } catch (e) {
            if ((e as Error).message !== '__exit__') throw e;
        }
        expect(exitCode).toBe(1);
        expect(stderrOut).toContain('_uuid');
    });

    test('exits 0 when registry is empty', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        registerPluginsCommand(program, registry, '1.9.0');
        try {
            await program.parseAsync(['plugins', 'check'], { from: 'user' });
        } catch (e) {
            if ((e as Error).message !== '__exit__') throw e;
        }
        expect(exitCode).toBe(0);
    });

    test('reports ALL namespace + collision errors, not just the first', async () => {
        const program = new Command();
        const registry = new PluginRegistry();
        // Two broken plugins: one namespace violation, one collision with built-in.
        registry.register({ name: 'faker', resolvers: { _stranger: () => 'x' } });
        registry.register({ name: 'uuid', resolvers: { _uuid: () => 'y' } });
        registerPluginsCommand(program, registry, '1.9.0');
        try {
            await program.parseAsync(['plugins', 'check'], { from: 'user' });
        } catch (e) {
            if ((e as Error).message !== '__exit__') throw e;
        }
        expect(exitCode).toBe(1);
        expect(stderrOut).toContain('_stranger');
        expect(stderrOut).toContain('_uuid');
        expect(stderrOut).toMatch(/2 issue\(s\)/);
    });
});
