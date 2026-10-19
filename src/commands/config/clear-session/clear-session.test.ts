import { describe, test, expect } from 'bun:test';
import { configClearSessionAction, type ConfigClearSessionDeps } from './clear-session';

function makeDeps(overrides: Partial<ConfigClearSessionDeps> = {}): ConfigClearSessionDeps & { cleared: (string | null)[]; clearedAll: number } {
    const calls = { cleared: [] as (string | null)[], clearedAll: 0 };

    return Object.assign(calls, {
        currentEnvironment: () => ({ name: 'dev' }),
        listEnvs: async () => [{ name: 'dev' }, { name: 'prod' }],
        clear: (env: string | null) => {
            calls.cleared.push(env);

            return true;
        },
        clearAll: () => {
            calls.clearedAll++;

            return true;
        },
        ...overrides,
    });
}

describe('configClearSessionAction', () => {
    test('clears the env-var credentials session when env vars supply the credentials', async () => {
        const deps = makeDeps({ currentEnvironment: () => ({ name: null }) });

        const result = await configClearSessionAction(deps);

        expect(result).toEqual({ ok: true, scope: 'env', env: null, cleared: true });
        expect(deps.cleared).toEqual([null]);
    });

    test('reports not-configured and clears nothing when no environment is configured', async () => {
        const deps = makeDeps({ currentEnvironment: () => null });

        const result = await configClearSessionAction(deps);

        expect(result).toEqual({ ok: false, reason: 'not-configured' });
        expect(deps.cleared).toEqual([]);
        expect(deps.clearedAll).toBe(0);
    });

    test('reports when there was no cached session to clear', async () => {
        const deps = makeDeps({ clear: () => false });

        expect(await configClearSessionAction({ ...deps, name: 'prod' }))
            .toEqual({ ok: true, scope: 'env', env: 'prod', cleared: false });
    });
});
