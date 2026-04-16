import { homedir } from 'os';
import { join, resolve } from 'path';

export interface PluginPaths {
    userDataDir: string;
    marketplaceDir: string;
    sourceDir: string;
}

export function getPluginPaths(_version: string): PluginPaths {
    const userDataDir = join(homedir(), '.apijack');

    return {
        userDataDir,
        marketplaceDir: join(userDataDir, 'plugin-marketplace'),
        sourceDir: resolve(import.meta.dir, '../..'),
    };
}
