import { existsSync, readFileSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

export interface InstallOptions {
    version: string;
    claudeDir: string;
    userDataDir: string;
    sourceDir: string;
    cliInvocation: string[];
    generatedDir: string;
}

export interface InstallResult {
    success: boolean;
    marketplaceDir: string;
    message: string;
}

export async function installPlugin(opts: InstallOptions): Promise<InstallResult> {
    const {
        version,
        claudeDir,
        userDataDir,
        sourceDir,
        cliInvocation,
        generatedDir,
    } = opts;

    // 1. Place plugin files in local marketplace: marketplaces/local/apijack/
    const localMarketplaceDir = join(claudeDir, 'plugins', 'marketplaces', 'local');
    const pluginDir = join(localMarketplaceDir, 'apijack');
    mkdirSync(join(localMarketplaceDir, '.claude-plugin'), { recursive: true });
    mkdirSync(join(pluginDir, '.claude-plugin'), { recursive: true });

    // Register in local marketplace.json with source: "./apijack"
    const localMarketplacePath = join(localMarketplaceDir, '.claude-plugin', 'marketplace.json');
    let localMarketplace: Record<string, unknown> = {
        $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
        name: 'local',
        owner: { name: 'Local Plugins' },
        plugins: [],
    };

    if (existsSync(localMarketplacePath)) {
        try {
            localMarketplace = JSON.parse(readFileSync(localMarketplacePath, 'utf-8'));
        } catch {}
    }

    const plugins = (localMarketplace.plugins as Array<{ name: string; [k: string]: unknown }>) || [];
    const idx = plugins.findIndex(p => p.name === 'apijack');
    const marketplaceEntry = {
        name: 'apijack',
        description: 'Jack into any OpenAPI spec — full CLI with AI-agentic workflow automation',
        category: 'development',
        source: './apijack',
    };

    if (idx >= 0) plugins[idx] = marketplaceEntry;
    else plugins.push(marketplaceEntry);

    localMarketplace.plugins = plugins;
    writeFileSync(localMarketplacePath, JSON.stringify(localMarketplace, null, 2) + '\n');

    // Write plugin.json manifest
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

    // Write .mcp.json with CLAUDE_PLUGIN_ROOT reference
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

    // Copy bundle
    const distDir = join(pluginDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    const bundleSrc = join(sourceDir, 'dist', 'mcp-server.bundle.js');

    if (existsSync(bundleSrc)) {
        cpSync(bundleSrc, join(distDir, 'mcp-server.bundle.js'));
    }

    // Copy skills (clear first to remove stale entries from previous versions)
    const skillsDst = join(pluginDir, 'skills');

    if (existsSync(skillsDst)) {
        rmSync(skillsDst, { recursive: true, force: true });
    }

    const skillsSrc = join(sourceDir, 'skills');

    if (existsSync(skillsSrc)) {
        cpSync(skillsSrc, skillsDst, { recursive: true });
    }

    // Clean up old registrations and cache before re-registering
    const installedPath = join(claudeDir, 'plugins', 'installed_plugins.json');
    const settingsPath = join(claudeDir, 'settings.json');

    const oldCacheDir = join(claudeDir, 'plugins', 'cache', 'local', 'apijack');

    if (existsSync(oldCacheDir)) {
        rmSync(oldCacheDir, { recursive: true, force: true });
    }

    const oldMarketplaceDir = join(claudeDir, 'plugins', 'marketplaces', 'apijack');

    if (existsSync(oldMarketplaceDir)) {
        rmSync(oldMarketplaceDir, { recursive: true, force: true });
    }

    // 3. Register in installed_plugins.json and enable in settings.json
    const installedPlugins = existsSync(installedPath)
        ? JSON.parse(readFileSync(installedPath, 'utf-8'))
        : { version: 2, plugins: {} };

    if (!installedPlugins.plugins) installedPlugins.plugins = {};

    delete installedPlugins.plugins['apijack@apijack'];
    installedPlugins.plugins['apijack@local'] = [{
        scope: 'user',
        installPath: pluginDir,
        version,
        installedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        gitCommitSha: '',
    }];
    writeFileSync(installedPath, JSON.stringify(installedPlugins, null, 2) + '\n');

    const settings = existsSync(settingsPath)
        ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
        : {};

    if (!settings.enabledPlugins) settings.enabledPlugins = {};

    delete settings.enabledPlugins['apijack@apijack'];
    settings.enabledPlugins['apijack@local'] = true;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

    // 4. Create user data directory
    mkdirSync(join(userDataDir, 'routines'), { recursive: true });

    // 5. Write plugin config for the MCP entry point
    writeFileSync(
        join(userDataDir, 'plugin.json'),
        JSON.stringify({ cliInvocation, generatedDir }, null, 2) + '\n',
    );

    return {
        success: true,
        marketplaceDir: pluginDir,
        message: `apijack plugin v${version} installed`,
    };
}
