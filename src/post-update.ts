import { existsSync } from 'fs';

/** Runs this CLI again with the given arguments; resolves with the exit code. */
export type SpawnCli = (args: string[]) => Promise<number>;

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
    if (opts.reinstallPlugin) {
        await opts.spawnCli(['plugin', 'install']);
    }
}

/** Spawns the running CLI (same runtime and entry script) with inherited stdio. */
export function defaultSpawnCli(): SpawnCli {
    return async (args) => {
        const proc = Bun.spawn([...process.argv.slice(0, 2), ...args], {
            stdout: 'inherit',
            stderr: 'inherit',
            env: { ...process.env, APIJACK_SKIP_UPDATE: '1' },
        });

        return proc.exited;
    };
}
