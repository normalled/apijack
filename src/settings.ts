import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ProjectSettings {
    customCommands?: {
        defaults?: {
            requiresAuth?: boolean;
        };
    };
}

export function loadProjectSettings(apijackDir: string): ProjectSettings {
    const settingsPath = join(apijackDir, 'settings.json');

    if (!existsSync(settingsPath)) return {};

    try {
        return JSON.parse(readFileSync(settingsPath, 'utf-8')) as ProjectSettings;
    } catch {
        return {};
    }
}
