import type { CustomResolver } from '../types';
import type { PluginRegistry } from '../plugin/registry';
import type { RoutineDefinition } from './types';

/**
 * Build the resolver map for a routine invocation.
 *
 * Merges (in order):
 * 1. Global / passed-in resolvers (e.g., project resolvers from `.apijack/resolvers/`,
 *    programmatic `cli.resolver(...)` registrations).
 * 2. Stateless plugin resolvers (plugin.resolvers) — same for every routine.
 * 3. Per-routine plugin resolvers (plugin.createRoutineResolvers(opts)) — fresh closure
 *    per call, with opts sourced from routine.plugins[plugin.name].
 *
 * Emits a stderr warning if routine.plugins references an unregistered plugin name.
 * Tolerates createRoutineResolvers throwing on the routine's opts — logs to stderr
 * and skips that plugin for this routine.
 */
export function buildRoutineResolvers(
    routine: RoutineDefinition,
    globalResolvers: Map<string, CustomResolver> | undefined,
    pluginRegistry: PluginRegistry | undefined,
): Map<string, CustomResolver> {
    const merged = new Map<string, CustomResolver>(globalResolvers ?? []);

    if (!pluginRegistry) return merged;

    // Warn on routine.plugins keys that don't match any registered plugin
    if (routine.plugins) {
        const knownNames = new Set(pluginRegistry.getAll().map(p => p.name));

        for (const key of Object.keys(routine.plugins)) {
            if (!knownNames.has(key)) {
                process.stderr.write(
                    `Warning: routine "${routine.name}" references unregistered plugin "${key}" — ignored.\n`,
                );
            }
        }
    }

    for (const plugin of pluginRegistry.getAll()) {
        // Stateless resolvers
        for (const [key, fn] of Object.entries(plugin.resolvers ?? {})) {
            merged.set(key, fn);
        }

        // Per-routine resolvers
        if (plugin.createRoutineResolvers) {
            const opts = routine.plugins?.[plugin.name] ?? {};

            try {
                const produced = plugin.createRoutineResolvers(opts);

                for (const [key, fn] of Object.entries(produced)) {
                    merged.set(key, fn);
                }
            } catch (e) {
                process.stderr.write(
                    `Warning: routine "${routine.name}" — plugin "${plugin.name}" createRoutineResolvers threw: ${(e as Error).message}\n`,
                );
            }
        }
    }

    return merged;
}
