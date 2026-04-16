import { existsSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'fs';
import { join } from 'path';
import { type ClaudeRunner, ensureClaudeCli, runClaudeCli } from './claude-cli';

export type { ClaudeRunner } from './claude-cli';

export interface InstallOptions {
    version: string;
    userDataDir: string;
    marketplaceDir: string;
    sourceDir: string;
    cliInvocation: string[];
    generatedDir: string;
    /** Overridable for tests. Defaults to spawning the real `claude` CLI. */
    runClaude?: ClaudeRunner;
    /** Overridable for tests. Defaults to checking the real `claude` CLI on PATH. */
    checkClaudeCli?: () => void;
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

    const runClaude = opts.runClaude ?? runClaudeCli;
    const checkCli = opts.checkClaudeCli ?? ensureClaudeCli;

    // Fail fast if the CLI isn't available — we don't want to lay out files we can't register
    if (!opts.runClaude) checkCli();

    const marketplaceDirExisted = existsSync(marketplaceDir);
    const pluginDir = join(marketplaceDir, 'apijack');

    try {
        // 1. Lay out the marketplace directory
        mkdirSync(join(marketplaceDir, '.claude-plugin'), { recursive: true });
        mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });

        writeFileSync(
            join(marketplaceDir, '.claude-plugin', 'marketplace.json'),
            JSON.stringify(buildMarketplaceManifest(), null, 2) + '\n',
        );

        writeFileSync(
            join(pluginDir, '.claude-plugin', 'plugin.json'),
            JSON.stringify(buildPluginManifest(version), null, 2) + '\n',
        );

        writeFileSync(
            join(pluginDir, '.mcp.json'),
            JSON.stringify(buildMcpConfig(), null, 2) + '\n',
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
    } catch (err) {
        // Roll back the marketplace dir we created so the next install starts clean
        if (!marketplaceDirExisted && existsSync(marketplaceDir)) {
            rmSync(marketplaceDir, { recursive: true, force: true });
        }

        throw err;
    }

    return {
        success: true,
        marketplaceDir,
        pluginDir,
        message: `apijack plugin v${version} installed`,
    };
}

function buildMarketplaceManifest(): Record<string, unknown> {
    return {
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
    };
}

function buildPluginManifest(version: string): Record<string, unknown> {
    return {
        name: 'apijack',
        description: 'Jack into any OpenAPI spec — full CLI with AI-agentic workflow automation',
        version,
        author: { name: 'apijack' },
        repository: 'https://github.com/normalled/apijack',
        license: 'MIT',
        keywords: ['openapi', 'cli', 'mcp', 'api', 'routines'],
    };
}

function buildMcpConfig(): Record<string, unknown> {
    return {
        mcpServers: {
            apijack: {
                type: 'stdio',
                command: 'bun',
                args: ['run', '${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.bundle.js'],
            },
        },
    };
}
