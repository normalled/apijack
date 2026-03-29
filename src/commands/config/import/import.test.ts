import { describe, test, expect, mock } from 'bun:test';
import { configImportAction } from './import';

describe('configImportAction', () => {
    test('saves environment for a known site', async () => {
        const saveFn = mock(() => Promise.resolve());
        const verifyFn = mock(() => Promise.resolve({ ok: true }));

        const result = await configImportAction({
            alias: 'staging',
            knownSites: {
                staging: { url: 'https://staging.example.com', description: 'Staging' },
            },
            user: 'admin',
            password: 'secret',
            cliName: 'testcli',
            verify: verifyFn,
            save: saveFn,
            saveOpts: {},
        });

        expect(result.saved).toBe(true);
        expect(result.verified).toBe(true);
        expect(saveFn).toHaveBeenCalled();
    });

    test('throws for unknown alias', () => {
        expect(configImportAction({
            alias: 'unknown',
            knownSites: {},
            user: 'admin',
            password: 'secret',
            cliName: 'testcli',
            verify: mock(() => Promise.resolve({ ok: true })),
            save: mock(() => Promise.resolve()),
            saveOpts: {},
        })).rejects.toThrow('Unknown site');
    });
});
