import { describe, test, expect, mock } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Command } from 'commander';
import { setupAction, setupUrlDefault, DEFAULT_SETUP_URL, registerSetupCommand } from './setup';

describe('setupUrlDefault', () => {
    test('falls back to localhost:8080 when no defaultUrl is configured', () => {
        expect(setupUrlDefault(undefined)).toBe('http://localhost:8080');
        expect(DEFAULT_SETUP_URL).toBe('http://localhost:8080');
    });

    test('uses the consumer-configured defaultUrl', () => {
        expect(setupUrlDefault('http://localhost:7080')).toBe('http://localhost:7080');
    });

    test('ignores an empty defaultUrl', () => {
        expect(setupUrlDefault('')).toBe('http://localhost:8080');
    });
});

describe('setupAction', () => {
    test('calls saveEnvironment with provided credentials', async () => {
        const saveFn = mock(() => Promise.resolve());
        const verifyFn = mock(() => Promise.resolve({ ok: true }));

        const result = await setupAction({
            cliName: 'testcli',
            envName: 'default',
            url: 'http://localhost:8080',
            user: 'admin',
            password: 'secret',
            verify: verifyFn,
            save: saveFn,
        });

        expect(result.saved).toBe(true);
        expect(result.verified).toBe(true);
        expect(saveFn).toHaveBeenCalledWith(
            'testcli', 'default',
            { url: 'http://localhost:8080', user: 'admin', password: 'secret' },
            true, {},
        );
    });

    test('returns verified=false when verification fails', async () => {
        const saveFn = mock(() => Promise.resolve());
        const verifyFn = mock(() => Promise.resolve({ ok: false, reason: 'Connection refused' }));

        const result = await setupAction({
            cliName: 'testcli',
            envName: 'default',
            url: 'http://localhost:8080',
            user: 'admin',
            password: 'secret',
            verify: verifyFn,
            save: saveFn,
        });

        expect(result.saved).toBe(true);
        expect(result.verified).toBe(false);
        expect(result.verifyReason).toBe('Connection refused');
    });

    test('throws when save fails', async () => {
        const saveFn = mock(() => Promise.reject(new Error('disk full')));
        const verifyFn = mock(() => Promise.resolve({ ok: true }));

        expect(setupAction({
            cliName: 'testcli',
            envName: 'default',
            url: 'http://localhost:8080',
            user: 'admin',
            password: 'secret',
            verify: verifyFn,
            save: saveFn,
        })).rejects.toThrow('disk full');
    });
});

describe('registerSetupCommand afterSave', () => {
    test('afterSave is awaited after a successful save', async () => {
        const dir = join(tmpdir(), `apijack-setup-aftersave-${Date.now()}`);
        mkdirSync(dir, { recursive: true });
        const answers = ['dev', 'http://127.0.0.1:9', 'me@example.com'];
        const events: string[] = [];
        const origLog = console.log;
        const origErr = console.error;
        console.log = (...a: unknown[]) => events.push(`log:${a.join(' ')}`);
        console.error = () => {};

        try {
            const program = new Command();
            registerSetupCommand(program, 'testcli', {
                configPath: join(dir, 'config.json'),
                io: {
                    prompt: async () => answers.shift() ?? '',
                    hiddenPrompt: async () => 'secret',
                },
                afterSave: async () => {
                    await Promise.resolve();
                    events.push('afterSave');
                },
            });

            await program.parseAsync(['node', 'testcli', 'setup']);
        } finally {
            console.log = origLog;
            console.error = origErr;
            rmSync(dir, { recursive: true, force: true });
        }

        expect(events.at(-1)).toBe('afterSave');
        expect(events.some(e => e.startsWith("log:Switched to 'dev'"))).toBe(true);
    });
});
