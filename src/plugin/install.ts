import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
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
    pluginCacheDir: string;
    message: string;
}

export async function installPlugin(opts: InstallOptions): Promise<InstallResult> {
    const {
        version,
        claudeDir,
        userDataDir,
        cliInvocation,
        generatedDir,
    } = opts;

    // 1. Register in local marketplace with npm source
    const marketplaceDir = join(claudeDir, 'plugins', 'marketplaces', 'local');
    const marketplacePath = join(marketplaceDir, '.claude-plugin', 'marketplace.json');
    mkdirSync(join(marketplaceDir, '.claude-plugin'), { recursive: true });

    let marketplace: any = {
        $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
        name: 'local',
        owner: { name: 'Local Plugins' },
        plugins: [],
    };
    if (existsSync(marketplacePath)) {
        try {
            marketplace = JSON.parse(readFileSync(marketplacePath, 'utf-8'));
        } catch {
            // Use fresh marketplace
        }
    }

    // Add or update apijack entry pointing to npm package
    const existingIdx = marketplace.plugins.findIndex((p: any) => p.name === 'apijack');
    const pluginEntry = {
        name: 'apijack',
        description: 'Jack into any OpenAPI spec — full CLI with AI-agentic workflow automation',
        category: 'development',
        source: {
            source: 'npm',
            package: '@apijack/core',
            version,
        },
    };
    if (existingIdx >= 0) {
        marketplace.plugins[existingIdx] = pluginEntry;
    } else {
        marketplace.plugins.push(pluginEntry);
    }
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');

    // 2. Create user data directory
    mkdirSync(join(userDataDir, 'routines'), { recursive: true });

    // 3. Write plugin config for the MCP entry point
    writeFileSync(
        join(userDataDir, 'plugin.json'),
        JSON.stringify({ cliInvocation, generatedDir }, null, 2) + '\n',
    );

    const pluginCacheDir = join(claudeDir, 'plugins', 'cache', 'local', 'apijack', version);

    return {
        success: true,
        pluginCacheDir,
        message: `apijack plugin v${version} registered in local marketplace`,
    };
}
