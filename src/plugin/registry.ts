import type { ApijackPlugin, CustomResolver } from '../types';
import { PluginNamespaceError, PluginCollisionError } from './errors';

const PLUGIN_NAME_RE = /^[a-z][a-z0-9_]*$/;

const BUILTIN_RESOLVER_NAMES: ReadonlySet<string> = new Set([
    '_uuid',
    '_random_int',
    '_random_from',
    '_random_distinct_from',
    '_random_hex_color',
    '_env',
    '_find',
    '_contains',
]);

export class PluginRegistry {
    private plugins = new Map<string, ApijackPlugin>();

    register(plugin: ApijackPlugin): void {
        if (!PLUGIN_NAME_RE.test(plugin.name)) {
            throw new Error(
                `Invalid plugin name "${plugin.name}". Must match /^[a-z][a-z0-9_]*$/.`,
            );
        }

        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin "${plugin.name}" is already registered.`);
        }

        this.plugins.set(plugin.name, plugin);
    }

    getAll(): ApijackPlugin[] {
        return Array.from(this.plugins.values());
    }

    get(name: string): ApijackPlugin | undefined {
        return this.plugins.get(name);
    }

    validateAll(projectResolvers?: Map<string, CustomResolver>): void {
        for (const plugin of this.plugins.values()) {
            this.validateNamespace(plugin);
        }

        this.validateCollisions(projectResolvers);
    }

    private validateNamespace(plugin: ApijackPlugin): void {
        const prefix = `_${plugin.name}`;
        const check = (name: string): void => {
            if (name !== prefix && !name.startsWith(`${prefix}_`)) {
                throw new PluginNamespaceError(plugin.name, name, prefix);
            }
        };

        for (const key of Object.keys(plugin.resolvers ?? {})) check(key);

        if (plugin.createRoutineResolvers) {
            let dry: Record<string, unknown>;

            try {
                dry = plugin.createRoutineResolvers({});
            } catch {
                // Plugin refused the dry call; skip namespace validation of factory output.
                return;
            }

            for (const key of Object.keys(dry)) check(key);
        }
    }

    private validateCollisions(projectResolvers?: Map<string, CustomResolver>): void {
        for (const plugin of this.plugins.values()) {
            const keys = this.collectResolverKeys(plugin);

            for (const key of keys) {
                if (BUILTIN_RESOLVER_NAMES.has(key)) {
                    throw new PluginCollisionError(key, `plugin "${plugin.name}"`, 'core built-in');
                }

                if (projectResolvers?.has(key)) {
                    throw new PluginCollisionError(
                        key,
                        `plugin "${plugin.name}"`,
                        '.apijack/resolvers/ project resolver',
                    );
                }
            }
        }
    }

    private collectResolverKeys(plugin: ApijackPlugin): string[] {
        const keys: string[] = [];
        keys.push(...Object.keys(plugin.resolvers ?? {}));

        if (plugin.createRoutineResolvers) {
            try {
                keys.push(...Object.keys(plugin.createRoutineResolvers({})));
            } catch {
                // ignore if plugin rejects empty opts
            }
        }

        return keys;
    }
}
