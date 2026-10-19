export interface ConfigClearSessionDeps {
    /** Environment to clear; defaults to the one the next command would use. */
    name?: string;
    all?: boolean;
    /** The environment the next command would use (name null for env-var credentials), or null if none is configured. */
    currentEnvironment: () => { name: string | null } | null;
    listEnvs: () => Promise<{ name: string }[]>;
    clear: (env: string | null) => boolean;
    clearAll: () => boolean;
}

export type ConfigClearSessionResult
    = | { ok: true; scope: 'all'; cleared: boolean }
        | { ok: true; scope: 'env'; env: string | null; cleared: boolean }
        | { ok: false; reason: 'name-with-all' }
        | { ok: false; reason: 'unknown-env'; available: string[] }
        | { ok: false; reason: 'not-configured' };

export async function configClearSessionAction(deps: ConfigClearSessionDeps): Promise<ConfigClearSessionResult> {
    if (deps.all && deps.name) return { ok: false, reason: 'name-with-all' };

    if (deps.all) return { ok: true, scope: 'all', cleared: deps.clearAll() };

    if (deps.name) {
        const envs = await deps.listEnvs();

        if (!envs.some(e => e.name === deps.name)) {
            return { ok: false, reason: 'unknown-env', available: envs.map(e => e.name) };
        }

        return { ok: true, scope: 'env', env: deps.name, cleared: deps.clear(deps.name) };
    }

    const current = deps.currentEnvironment();

    if (!current) return { ok: false, reason: 'not-configured' };

    return { ok: true, scope: 'env', env: current.name, cleared: deps.clear(current.name) };
}
