import { describe, test, expect, mock } from 'bun:test';
import { configSwitchAction } from './switch';

describe('configSwitchAction', () => {
    test('returns success when environment exists', async () => {
        const result = await configSwitchAction({
            name: 'staging',
            switchEnv: mock(() => Promise.resolve(true)),
            invalidateSession: mock(() => {}),
        });
        expect(result.ok).toBe(true);
    });

    test('returns available envs when environment not found', async () => {
        const result = await configSwitchAction({
            name: 'nonexistent',
            switchEnv: mock(() => Promise.resolve(false)),
            invalidateSession: mock(() => {}),
            listEnvs: mock(() => Promise.resolve([
                { name: 'local', url: '', user: '', active: true },
            ])),
        });
        expect(result.ok).toBe(false);
        expect(result.available).toEqual(['local']);
    });
});
