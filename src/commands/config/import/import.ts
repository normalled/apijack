export interface ConfigImportDeps {
    alias: string;
    knownSites: Record<string, { url: string; description: string }>;
    user: string;
    password: string;
    cliName: string;
    verify: (url: string, user: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
    save: (...args: unknown[]) => Promise<void>;
    saveOpts: Record<string, unknown>;
}

export interface ConfigImportResult {
    saved: boolean;
    verified: boolean;
    verifyReason?: string;
}

export async function configImportAction(deps: ConfigImportDeps): Promise<ConfigImportResult> {
    const site = deps.knownSites[deps.alias];

    if (!site) throw new Error(`Unknown site '${deps.alias}'.`);

    const verifyResult = await deps.verify(site.url, deps.user, deps.password);

    await deps.save(deps.cliName, deps.alias, {
        url: site.url,
        user: deps.user,
        password: deps.password,
    }, true, deps.saveOpts);

    return {
        saved: true,
        verified: verifyResult.ok,
        verifyReason: verifyResult.ok ? undefined : verifyResult.reason,
    };
}
