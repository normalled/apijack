import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';

export interface PluginConfig {
    cliInvocation: string[];
    generatedDir: string;
    allowedCidrs?: string[];
}

export function loadPluginConfig(dataDir?: string): PluginConfig | null {
    const dir = dataDir ?? join(homedir(), '.apijack');
    const configPath = join(dir, 'plugin.json');
    try {
        if (!existsSync(configPath)) return null;
        const raw = readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as PluginConfig;
    } catch {
        return null;
    }
}

/**
 * Resolve generatedDir to an absolute path.
 * If already absolute, use as-is.
 * If relative, resolve relative to the CLI entrypoint's package root.
 */
function resolveGeneratedDir(config: PluginConfig): string {
    const dir = config.generatedDir;
    if (dir.startsWith('/')) return dir;

    // Resolve relative to the directory containing the CLI entrypoint
    // e.g. cliInvocation = ["bun", "/path/to/package/bin/apijack.ts"]
    // → package root = /path/to/package
    const cliEntry = config.cliInvocation[config.cliInvocation.length - 1];
    const packageRoot = dirname(dirname(cliEntry));
    return resolve(packageRoot, dir);
}

// Entry point — only runs when executed directly
if (import.meta.main) {
    const config = loadPluginConfig();
    if (!config) {
        console.error("apijack plugin not configured. Run your CLI's 'plugin install' command first.");
        console.error('Expected config at: ~/.apijack/plugin.json');
        process.exit(1);
    }

    const { startMcpServer } = await import('./mcp-server');
    await startMcpServer({
        cliName: 'apijack',
        cliInvocation: config.cliInvocation,
        generatedDir: resolveGeneratedDir(config),
        routinesDir: join(homedir(), '.apijack', 'routines'),
        allowedCidrs: config.allowedCidrs,
    });
}
