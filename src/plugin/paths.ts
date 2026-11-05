import { join, resolve } from 'path';
import { userHome } from '../home';

export interface PluginPaths {
    userDataDir: string;
    marketplaceDir: string;
    sourceDir: string;
}

export function getPluginPaths(_version: string): PluginPaths {
    const userDataDir = join(userHome(), '.apijack');

    return {
        userDataDir,
        marketplaceDir: join(userDataDir, 'plugin-marketplace'),
        sourceDir: resolve(import.meta.dir, '../..'),
    };
}
