import { existsSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

export type ClaudeRunner = (args: string[]) => Promise<void>;

export interface InstallOptions {
    version: string;
    userDataDir: string;
    marketplaceDir: string;
    sourceDir: string;
    cliInvocation: string[];
    generatedDir: string;
    /** Overridable for tests. Defaults to spawning the real `claude` CLI. */
    runClaude?: ClaudeRunner;
}

export interface InstallResult {
    success: boolean;
    marketplaceDir: string;
    pluginDir: string;
    message: string;
}

export async function installPlugin(opts: InstallOptions): Promise<InstallResult> {
    const {
        version,
        userDataDir,
        marketplaceDir,
        sourceDir,
        cliInvocation,
        generatedDir,
    } = opts;

    const runClaude = opts.runClaude ?? defaultRunClaude;

    if (!opts.runClaude) ensureClaudeCli();

    const pluginDir = join(marketplaceDir, 'apijack');

    // 1. Lay out the marketplace directory
    mkdirSync(join(marketplaceDir, '.claude-plugin'), { recursive: true });
    mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });

    writeFileSync(
        join(marketplaceDir, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({
            name: 'apijack',
            owner: { name: 'apijack' },
            metadata: {
                description: 'apijack plugin marketplace — MCP server, skills, and routines for Jacking into OpenAPI specs',
            },
            plugins: [
                {
                    name: 'apijack',
                    description: 'Jack into any OpenAPI spec — full CLI with AI-agentic workflow automation',
                    category: 'development',
                    source: './apijack',
                },
            ],
        }, null, 2) + '\n',
    );

    writeFileSync(
        join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
            name: 'apijack',
            description: 'Jack into any OpenAPI spec — full CLI with AI-agentic workflow automation',
            version,
            author: { name: 'apijack' },
            repository: 'https://github.com/normalled/apijack',
            license: 'MIT',
            keywords: ['openapi', 'cli', 'mcp', 'api', 'routines'],
        }, null, 2) + '\n',
    );

    writeFileSync(
        join(pluginDir, '.mcp.json'),
        JSON.stringify({
            mcpServers: {
                apijack: {
                    type: 'stdio',
                    command: 'bun',
                    args: ['run', '${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.bundle.js'],
                },
            },
        }, null, 2) + '\n',
    );

    // 2. Copy bundle
    const distDir = join(pluginDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    const bundleSrc = join(sourceDir, 'dist', 'mcp-server.bundle.js');

    if (existsSync(bundleSrc)) {
        cpSync(bundleSrc, join(distDir, 'mcp-server.bundle.js'));
    }

    // 3. Copy skills (clear first to remove stale entries from previous versions)
    const skillsDst = join(pluginDir, 'skills');

    if (existsSync(skillsDst)) {
        rmSync(skillsDst, { recursive: true, force: true });
    }

    const skillsSrc = join(sourceDir, 'skills');

    if (existsSync(skillsSrc)) {
        cpSync(skillsSrc, skillsDst, { recursive: true });
    }

    // 4. Write runtime config for the MCP entry point
    mkdirSync(join(userDataDir, 'routines'), { recursive: true });
    writeFileSync(
        join(userDataDir, 'plugin.json'),
        JSON.stringify({ cliInvocation, generatedDir }, null, 2) + '\n',
    );

    // 5. Register marketplace and install via claude CLI
    await runClaude(['plugin', 'marketplace', 'add', marketplaceDir]);
    await runClaude(['plugin', 'install', 'apijack@apijack']);

    return {
        success: true,
        marketplaceDir,
        pluginDir,
        message: `apijack plugin v${version} installed`,
    };
}

function ensureClaudeCli(): void {
    const proc = Bun.spawnSync(['claude', '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
    });

    if (proc.exitCode !== 0) {
        throw new Error(
            'Claude Code CLI ("claude") not found on PATH. Install Claude Code before running "apijack plugin install".',
        );
    }
}

async function defaultRunClaude(args: string[]): Promise<void> {
    const proc = Bun.spawn(['claude', ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        throw new Error(`claude ${args.join(' ')} exited ${exitCode}`);
    }
}
