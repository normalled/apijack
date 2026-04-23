import type { ApijackPlugin, CustomResolver } from '../types';
import { BUILTIN_RESOLVER_NAMES } from '../routine/resolver';
import { PluginNamespaceError, PluginCollisionError } from './errors';

const PLUGIN_NAME_RE = /^[a-z][a-z0-9_]*$/;

interface PluginInfo {
    staticKeys: string[];
    factoryKeys: string[] | null;
}

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
            const info = this.collectPluginInfo(plugin);
            this.validateNamespace(plugin, info);
            this.validateCollisions(plugin, info, projectResolvers);
        }
    }

    private collectPluginInfo(plugin: ApijackPlugin): PluginInfo {
        const staticKeys = Object.keys(plugin.resolvers ?? {});

        if (!plugin.createRoutineResolvers) {
            return { staticKeys, factoryKeys: null };
        }

        try {
            return {
                staticKeys,
                factoryKeys: Object.keys(plugin.createRoutineResolvers({})),
            };
        } catch {
            // Plugin rejected the dry call; skip factory-output checks.
            return { staticKeys, factoryKeys: null };
        }
    }

    private validateNamespace(plugin: ApijackPlugin, info: PluginInfo): void {
        const prefix = `_${plugin.name}`;
        const check = (name: string): void => {
            if (name !== prefix && !name.startsWith(`${prefix}_`)) {
                throw new PluginNamespaceError(plugin.name, name, prefix);
            }
        };

        for (const key of info.staticKeys) check(key);

        if (info.factoryKeys) {
            for (const key of info.factoryKeys) check(key);
        }
    }

    private validateCollisions(
        plugin: ApijackPlugin,
        info: PluginInfo,
        projectResolvers?: Map<string, CustomResolver>,
    ): void {
        const allKeys = info.factoryKeys
            ? [...info.staticKeys, ...info.factoryKeys]
            : info.staticKeys;

        for (const key of allKeys) {
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
