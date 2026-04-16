import { existsSync, rmSync } from 'fs';

export type ClaudeRunner = (args: string[]) => Promise<void>;

export interface UninstallOptions {
    marketplaceDir: string;
    /** Overridable for tests. Defaults to spawning the real `claude` CLI. */
    runClaude?: ClaudeRunner;
}

export interface UninstallResult {
    success: boolean;
    message: string;
}

export async function uninstallPlugin(opts: UninstallOptions): Promise<UninstallResult> {
    const { marketplaceDir } = opts;
    const runClaude = opts.runClaude ?? defaultRunClaude;

    // Best-effort unregister via claude CLI — ignore failures so cleanup continues
    await runClaude(['plugin', 'uninstall', 'apijack@apijack']).catch(() => {});
    await runClaude(['plugin', 'marketplace', 'remove', 'apijack']).catch(() => {});

    if (existsSync(marketplaceDir)) {
        rmSync(marketplaceDir, { recursive: true, force: true });
    }

    return {
        success: true,
        message: 'apijack plugin uninstalled. User data preserved at ~/.apijack/',
    };
}

async function defaultRunClaude(args: string[]): Promise<void> {
    const proc = Bun.spawn(['claude', ...args], {
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        throw new Error(`claude ${args.join(' ')} exited ${exitCode}`);
    }
}
