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
});

describe('plugins check', () => {
    let stdoutOut: string;
    let exitCode: number | null;
    let origStdoutWrite: typeof process.stdout.write;
    let origExit: typeof process.exit;

    beforeEach(() => {
        stdoutOut = '';
        exitCode = null;
        origStdoutWrite = process.stdout.write.bind(process.stdout);
        origExit = process.exit.bind(process);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdoutOut += String(chunk);

            return true;
        }) as never;
        process.exit = ((code?: number) => {
            exitCode = code ?? 0;
            throw new Error('__exit__');
        }) as never;
    });

    afterEach(() => {
        process.stdout.write = origStdoutWrite as never;
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
        expect(stdoutOut).toContain('faker');
        expect(stdoutOut).toContain('_stranger');
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
        expect(stdoutOut).toContain('_uuid');
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
});
