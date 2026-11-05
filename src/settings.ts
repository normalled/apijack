import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DISABLEABLE_COMMANDS, type DisableableCommand } from './types';

export interface ProjectSettings {
    /** Optional built-in commands to turn off. See `CliOptions.disableCommands`. */
    disableCommands?: DisableableCommand[];
    skills?: {
        /** Ship apijack's built-in skills alongside the project's own. Default true. */
        builtin?: boolean;
    };
    customCommands?: {
        defaults?: {
            requiresAuth?: boolean;
        };
    };
    auth?: {
        /** HTTP statuses that trigger a one-shot session refresh + retry, for
         *  any auth strategy. See `CliOptions.refreshOn`. */
        refreshOn?: number[];
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function warnAndIgnore(key: string, expected: string): void {
    console.warn(`[apijack] .apijack/settings.json: '${key}' must be ${expected} — ignoring`);
}

function validateProjectSettings(parsed: unknown): ProjectSettings {
    if (!isPlainObject(parsed)) {
        console.warn('[apijack] .apijack/settings.json: settings must be a JSON object — ignoring');

        return {};
    }

    const settings = parsed as ProjectSettings & Record<string, unknown>;

    if ('customCommands' in settings) {
        if (!isPlainObject(settings.customCommands)) {
            warnAndIgnore('customCommands', 'an object');
            delete settings.customCommands;
        } else {
            const customCommands = settings.customCommands;

            if ('defaults' in customCommands) {
                if (!isPlainObject(customCommands.defaults)) {
                    warnAndIgnore('customCommands.defaults', 'an object');
                    delete customCommands.defaults;
                } else {
                    const defaults = customCommands.defaults;

                    if ('requiresAuth' in defaults && typeof defaults.requiresAuth !== 'boolean') {
                        warnAndIgnore('customCommands.defaults.requiresAuth', 'a boolean');
                        delete defaults.requiresAuth;
                    }
                }
            }
        }
    }

    if ('auth' in settings) {
        if (!isPlainObject(settings.auth)) {
            warnAndIgnore('auth', 'an object');
            delete settings.auth;
        } else {
            const auth = settings.auth;

            if ('refreshOn' in auth) {
                const refreshOn = auth.refreshOn;

                if (!Array.isArray(refreshOn) || !refreshOn.every(v => typeof v === 'number')) {
                    warnAndIgnore('auth.refreshOn', 'an array of numbers');
                    delete auth.refreshOn;
                }
            }
        }
    }

    if ('skills' in settings) {
        if (!isPlainObject(settings.skills)) {
            warnAndIgnore('skills', 'an object');
            delete settings.skills;
        } else if ('builtin' in settings.skills && typeof settings.skills.builtin !== 'boolean') {
            warnAndIgnore('skills.builtin', 'a boolean');
            delete settings.skills.builtin;
        }
    }

    if ('disableCommands' in settings) {
        const disable = settings.disableCommands as unknown;

        if (!Array.isArray(disable)) {
            warnAndIgnore('disableCommands', 'an array of command names');
            delete settings.disableCommands;
        } else {
            const allowed = DISABLEABLE_COMMANDS.map(c => `'${c}'`).join(', ');

            settings.disableCommands = disable.filter((entry, i): entry is DisableableCommand => {
                const ok = DISABLEABLE_COMMANDS.includes(entry as DisableableCommand);

                if (!ok) warnAndIgnore(`disableCommands[${i}]`, `one of ${allowed}`);

                return ok;
            });
        }
    }

    return settings;
}

export function loadProjectSettings(apijackDir: string): ProjectSettings {
    const settingsPath = join(apijackDir, 'settings.json');

    if (!existsSync(settingsPath)) return {};

    try {
        const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'));

        return validateProjectSettings(parsed);
    } catch {
        return {};
    }
}
