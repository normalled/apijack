export interface ConfigSwitchDeps {
    name: string;
    switchEnv: (name: string) => Promise<boolean>;
    invalidateSession: () => void;
    listEnvs?: () => Promise<{ name: string }[]>;
}

export interface ConfigSwitchResult {
    ok: boolean;
    available?: string[];
}

export async function configSwitchAction(deps: ConfigSwitchDeps): Promise<ConfigSwitchResult> {
    const ok = await deps.switchEnv(deps.name);
    if (!ok) {
        const envs = deps.listEnvs ? await deps.listEnvs() : [];
        return { ok: false, available: envs.map(e => e.name) };
    }
    deps.invalidateSession();
    return { ok: true };
}
