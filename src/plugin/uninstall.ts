import { existsSync, rmSync } from 'fs';
import { type ClaudeRunner, runClaudeCli } from './claude-cli';

export type { ClaudeRunner } from './claude-cli';

export interface UninstallOptions {
    marketplaceDir: string;
    /** Overridable for tests. Defaults to spawning the real `claude` CLI. */
    runClaude?: ClaudeRunner;
}

export interface UninstallResult {
    success: boolean;
    message: string;
    warnings: string[];
}

export async function uninstallPlugin(opts: UninstallOptions): Promise<UninstallResult> {
    const { marketplaceDir } = opts;
    const runClaude = opts.runClaude ?? runClaudeCli;
    const warnings: string[] = [];

    // Unregister via claude CLI. Failures are surfaced as warnings so filesystem cleanup
    // still runs even if the CLI is unavailable or the plugin is already gone.
    await runClaude(['plugin', 'uninstall', 'apijack@apijack']).catch((err) => {
        warnings.push(`claude plugin uninstall apijack@apijack: ${formatError(err)}`);
    });
    await runClaude(['plugin', 'marketplace', 'remove', 'apijack']).catch((err) => {
        warnings.push(`claude plugin marketplace remove apijack: ${formatError(err)}`);
    });

    if (existsSync(marketplaceDir)) {
        rmSync(marketplaceDir, { recursive: true, force: true });
    }

    const baseMessage = 'apijack plugin uninstalled. User data preserved at ~/.apijack/';
    const message = warnings.length > 0
        ? `${baseMessage}\nWarnings:\n  - ${warnings.join('\n  - ')}`
        : baseMessage;

    return {
        success: true,
        message,
        warnings,
    };
}

function formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
