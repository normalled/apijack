import type { ApijackPlugin } from '../types';

export class PluginRegistry {
    private plugins = new Map<string, ApijackPlugin>();

    register(plugin: ApijackPlugin): void {
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
}
