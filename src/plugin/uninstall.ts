import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

export interface UninstallOptions {
    claudeDir: string;
}

export interface UninstallResult {
    success: boolean;
    message: string;
}

export async function uninstallPlugin(opts: UninstallOptions): Promise<UninstallResult> {
    const { claudeDir } = opts;

    // 1. Remove plugin directory from local marketplace
    const pluginDir = join(claudeDir, 'plugins', 'marketplaces', 'local', 'apijack');
    if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
    }

    // Remove legacy separate marketplace directory
    const legacyMarketplaceDir = join(claudeDir, 'plugins', 'marketplaces', 'apijack');
    if (existsSync(legacyMarketplaceDir)) {
        rmSync(legacyMarketplaceDir, { recursive: true, force: true });
    }

    // 2. Remove apijack entry from local marketplace.json
    const localMarketplacePath = join(claudeDir, 'plugins', 'marketplaces', 'local', '.claude-plugin', 'marketplace.json');
    if (existsSync(localMarketplacePath)) {
        try {
            const local = JSON.parse(readFileSync(localMarketplacePath, 'utf-8'));
            local.plugins = (local.plugins || []).filter((p: { name: string }) => p.name !== 'apijack');
            writeFileSync(localMarketplacePath, JSON.stringify(local, null, 2) + '\n');
        } catch {}
    }

    // 3. Clean up registrations (current + legacy)
    const installedPath = join(claudeDir, 'plugins', 'installed_plugins.json');
    if (existsSync(installedPath)) {
        try {
            const installed = JSON.parse(readFileSync(installedPath, 'utf-8'));
            delete installed.plugins['apijack@apijack'];
            delete installed.plugins['apijack@local'];
            writeFileSync(installedPath, JSON.stringify(installed, null, 2) + '\n');
        } catch {}
    }

    const settingsPath = join(claudeDir, 'settings.json');
    if (existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
            if (settings.enabledPlugins) {
                delete settings.enabledPlugins['apijack@apijack'];
                delete settings.enabledPlugins['apijack@local'];
            }
            writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        } catch {}
    }

    // 4. Remove old plugin cache
    const cacheDir = join(claudeDir, 'plugins', 'cache', 'local', 'apijack');
    if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true });
    }

    // NOTE: User data at ~/.apijack/ is intentionally preserved

    return {
        success: true,
        message: 'apijack plugin uninstalled. User data preserved at ~/.apijack/',
    };
}
