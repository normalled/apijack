import type { ApijackPlugin } from '../types';
import { PluginNamespaceError } from './errors';

const PLUGIN_NAME_RE = /^[a-z][a-z0-9_]*$/;

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

    validateAll(): void {
        for (const plugin of this.plugins.values()) {
            this.validateNamespace(plugin);
        }
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
}
