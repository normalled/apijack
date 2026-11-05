import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export type CliSkillsState = {
    /** The user said no to the setup offer. */
    declined?: boolean;
    /** When the outdated notice last printed (ISO). */
    lastNotice?: string;
    /** Source skill names that existed at the last install / update. */
    seen?: string[];
};

type StateFile = Record<string, CliSkillsState>;

function readAll(path: string): StateFile {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;

        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as StateFile : {};
    } catch {
        return {};
    }
}

/** This CLI's entry, keeping only fields with the right shape (the file may be hand-edited). */
export function readCliState(path: string, cli: string): CliSkillsState {
    const entry = readAll(path)[cli] as Record<string, unknown> | undefined;

    if (typeof entry !== 'object' || entry === null) return {};

    const state: CliSkillsState = {};

    if (typeof entry.declined === 'boolean') state.declined = entry.declined;

    if (typeof entry.lastNotice === 'string') state.lastNotice = entry.lastNotice;

    if (Array.isArray(entry.seen) && entry.seen.every(s => typeof s === 'string')) state.seen = entry.seen;

    return state;
}

export function patchCliState(path: string, cli: string, patch: Partial<CliSkillsState>): void {
    const all = readAll(path);
    const prev = all[cli];
    all[cli] = { ...(typeof prev === 'object' && prev !== null && !Array.isArray(prev) ? prev : {}), ...patch };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(all, null, 2) + '\n');
}
