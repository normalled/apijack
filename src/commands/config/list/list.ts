interface EnvEntry {
    name: string;
    url: string;
    user: string;
    active: boolean;
}

export interface ConfigListDeps {
    listEnvs: () => Promise<EnvEntry[]>;
}

export async function configListAction(deps: ConfigListDeps): Promise<EnvEntry[]> {
    return deps.listEnvs();
}
