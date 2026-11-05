import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { installNameFor, MARKER_FILE, type RenderedSkill } from './render';

export { MARKER_FILE };

export type SkillMarker = {
    cli: string;
    skill: string;
    source: 'builtin' | 'project';
    hash: string;
    installedAt: string;
};

export type SkillStatus = 'not installed' | 'up to date' | 'outdated' | 'conflict' | 'orphaned';

export type SkillStatusEntry = { skill: string; installName: string; status: SkillStatus };

/** The ownership marker in an installed skill directory, or null if absent or unreadable. */
export function readMarker(dir: string): SkillMarker | null {
    try {
        const m = JSON.parse(readFileSync(join(dir, MARKER_FILE), 'utf-8')) as Partial<SkillMarker>;

        if (typeof m.cli !== 'string' || typeof m.skill !== 'string' || typeof m.hash !== 'string') return null;

        return m as SkillMarker;
    } catch {
        return null;
    }
}

/**
 * The marker if this CLI owns `dir`: it names this CLI, and the directory is
 * where this CLI would have put that skill. A copied or renamed directory
 * still carries the marker, but isn't ours to update or delete.
 */
function ownedMarker(dir: string, cli: string): SkillMarker | null {
    // A symlinked install (e.g. managed by dotfiles) isn't ours to rewrite or delete.
    try {
        if (lstatSync(dir).isSymbolicLink()) return null;
    } catch {
        return null;
    }

    const marker = readMarker(dir);

    return marker?.cli === cli && basename(dir) === installNameFor(cli, marker.skill) ? marker : null;
}

/** Installed skill directories this CLI owns. */
export function ownedInstalls(cli: string, skillsDir: string): { dir: string; marker: SkillMarker }[] {
    if (!existsSync(skillsDir)) return [];

    const owned: { dir: string; marker: SkillMarker }[] = [];

    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const dir = join(skillsDir, entry.name);
        const marker = ownedMarker(dir, cli);

        if (marker) owned.push({ dir, marker });
    }

    return owned;
}

export function skillStatuses(cli: string, rendered: RenderedSkill[], skillsDir: string): SkillStatusEntry[] {
    const entries: SkillStatusEntry[] = rendered.map((r) => {
        const dir = join(skillsDir, r.installName);

        if (!existsSync(dir)) return { skill: r.skill, installName: r.installName, status: 'not installed' };

        const marker = ownedMarker(dir, cli);

        if (marker?.skill !== r.skill) return { skill: r.skill, installName: r.installName, status: 'conflict' };

        return {
            skill: r.skill,
            installName: r.installName,
            status: marker.hash === r.hash ? 'up to date' : 'outdated',
        };
    });

    const current = new Set(rendered.map(r => r.skill));

    for (const { dir, marker } of ownedInstalls(cli, skillsDir)) {
        if (!current.has(marker.skill)) {
            entries.push({ skill: marker.skill, installName: dir.slice(skillsDir.length + 1), status: 'orphaned' });
        }
    }

    return entries;
}

/** Replace the install directory's contents with the rendered files and stamp the marker. */
export function writeSkill(r: RenderedSkill, cli: string, skillsDir: string): void {
    const dir = join(skillsDir, r.installName);

    rmSync(dir, { recursive: true, force: true });

    for (const f of r.files) {
        const target = join(dir, f.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, f.content);
    }

    mkdirSync(dir, { recursive: true });

    const marker: SkillMarker = {
        cli,
        skill: r.skill,
        source: r.source,
        hash: r.hash,
        installedAt: new Date().toISOString(),
    };

    writeFileSync(join(dir, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n');
}

/** Delete an install directory, but only if this CLI owns it. */
export function removeOwned(dir: string, cli: string): boolean {
    if (!ownedMarker(dir, cli)) return false;

    rmSync(dir, { recursive: true, force: true });

    return true;
}
