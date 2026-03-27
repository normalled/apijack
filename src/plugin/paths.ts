import { homedir } from 'os';
import { join, resolve } from 'path';

export interface PluginPaths {
    claudeDir: string;
    pluginCacheDir: string;
    installedPluginsFile: string;
    settingsFile: string;
    userDataDir: string;
    sourceDir: string;
}

export function getPluginPaths(version: string): PluginPaths {
    const home = homedir();
    const claudeDir = join(home, '.claude');
    const pluginsDir = join(claudeDir, 'plugins');

    return {
        claudeDir,
        pluginCacheDir: join(pluginsDir, 'cache', 'local', 'apijack', version),
        installedPluginsFile: join(pluginsDir, 'installed_plugins.json'),
        settingsFile: join(claudeDir, 'settings.json'),
        userDataDir: join(home, '.apijack'),
        sourceDir: resolve(import.meta.dir, '../..'),
    };
}
