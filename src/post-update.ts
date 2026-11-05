import { existsSync } from 'fs';

/** Runs this CLI again with the given arguments (and extra env); resolves with the exit code. */
export type SpawnCli = (args: string[], env?: Record<string, string>) => Promise<number>;

/** Env var that makes `run()` refresh installed skills and exit, before reading argv. */
export const REFRESH_SKILLS_ENV = 'APIJACK_REFRESH_SKILLS';

/**
 * Whether an update should re-run `plugin install`: only when the CLI still
 * offers `mcp` and `plugin`, and the plugin was installed before (its
 * marketplace directory exists).
 */
export function shouldReinstallPlugin(opts: {
    mcpEnabled: boolean;
    pluginEnabled: boolean;
    marketplaceDir: string;
}): boolean {
    return opts.mcpEnabled && opts.pluginEnabled && existsSync(opts.marketplaceDir);
}

/** Refresh what an update leaves stale. Runs after `upgrade` and the startup update prompt. */
export async function refreshAfterUpdate(opts: { reinstallPlugin: boolean; spawnCli: SpawnCli }): Promise<void> {
    // Signalled through the environment, not `skills update` argv: an API with
    // its own `skills` command group would otherwise receive the call.
    await opts.spawnCli([], { [REFRESH_SKILLS_ENV]: '1' });

    // `plugin install` moves old-plugin users onto personal skills itself (old
    // versions' `upgrade` calls it directly, so that's where the migration lives).
    if (opts.reinstallPlugin) {
        await opts.spawnCli(['plugin', 'install']);
    }
}

/** Spawns the running CLI (same runtime and entry script) with inherited stdio. */
export function defaultSpawnCli(): SpawnCli {
    return async (args, env) => {
        const proc = Bun.spawn([...process.argv.slice(0, 2), ...args], {
            stdout: 'inherit',
            stderr: 'inherit',
            env: { ...process.env, APIJACK_SKIP_UPDATE: '1', ...env },
        });

        return proc.exited;
    };
}
