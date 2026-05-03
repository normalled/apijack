import type { CliConfig, EnvironmentConfig } from '../../../config';

export interface ConfigUpdatePasswordDeps {
    envName?: string;
    password: string;
    loadConfig: (cliName: string) => Promise<CliConfig | null>;
    save: (cliName: string, name: string, env: EnvironmentConfig, setActive?: boolean, opts?: Record<string, unknown>) => Promise<void>;
    cliName: string;
    /** Display name for user-facing hints. Defaults to cliName. */
    displayName?: string;
    saveOpts: Record<string, unknown>;
}

export interface ConfigUpdatePasswordResult {
    ok: boolean;
    envName: string;
}

export async function configUpdatePasswordAction(deps: ConfigUpdatePasswordDeps): Promise<ConfigUpdatePasswordResult> {
    const cfg = await deps.loadConfig(deps.cliName);

    if (!cfg || Object.keys(cfg.environments).length === 0) {
        const displayName = deps.displayName ?? deps.cliName;
        throw new Error(`No environments configured. Run '${displayName} config import' first.`);
    }

    const envName = deps.envName ?? cfg.active;
    const env = cfg.environments[envName];

    if (!env) {
        throw new Error(`Environment '${envName}' not found.`);
    }

    await deps.save(deps.cliName, envName, { ...env, password: deps.password }, false, deps.saveOpts);

    return { ok: true, envName };
}
