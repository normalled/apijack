export class PluginNamespaceError extends Error {
    constructor(
        public readonly pluginName: string,
        public readonly resolverName: string,
        public readonly expectedPrefix: string,
    ) {
        super(
            `Plugin "${pluginName}" registered resolver "${resolverName}" which is outside its namespace. `
            + `Plugin resolver names must start with "${expectedPrefix}" or "${expectedPrefix}_".`,
        );
        this.name = 'PluginNamespaceError';
    }
}

export class PluginCollisionError extends Error {
    constructor(
        public readonly resolverName: string,
        public readonly sourceA: string,
        public readonly sourceB: string,
    ) {
        super(
            `Resolver name "${resolverName}" is registered by both "${sourceA}" and "${sourceB}". `
            + 'Collisions are not allowed; rename one to proceed.',
        );
        this.name = 'PluginCollisionError';
    }
}

export class PluginPeerMismatchError extends Error {
    constructor(
        public readonly pluginName: string,
        public readonly declaredRange: string,
        public readonly installedVersion: string,
    ) {
        super(
            `Plugin "${pluginName}" declares peer range "@apijack/core@${declaredRange}" `
            + `but installed core is ${installedVersion}.`,
        );
        this.name = 'PluginPeerMismatchError';
    }
}
