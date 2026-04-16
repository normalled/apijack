export type ClaudeRunner = (args: string[]) => Promise<void>;

/** Checks that the `claude` CLI is available on PATH. Throws a helpful error if not. */
export function ensureClaudeCli(): void {
    let ok = false;

    try {
        const proc = Bun.spawnSync(['claude', '--version'], {
            stdout: 'pipe',
            stderr: 'pipe',
        });

        ok = proc.exitCode === 0;
    } catch {
        // Command not found — spawnSync threw
    }

    if (!ok) {
        throw new Error(
            'Claude Code CLI ("claude") not found on PATH. Install Claude Code before running "apijack plugin" commands.',
        );
    }
}

/** Invokes the real `claude` CLI and throws on non-zero exit. stderr/stdout pass through to the parent process. */
export async function runClaudeCli(args: string[]): Promise<void> {
    const proc = Bun.spawn(['claude', ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        throw new Error(`claude ${args.join(' ')} exited ${exitCode}`);
    }
}
