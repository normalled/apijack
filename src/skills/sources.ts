import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export type SkillSource = {
    name: string;
    dir: string;
    source: 'builtin' | 'project';
};

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Built-in skills only shipped for the bare `apijack` CLI. */
const BARE_APIJACK_ONLY = new Set(['setup-api']);

function scan(baseDir: string, source: SkillSource['source'], warnings: string[]): SkillSource[] {
    if (!existsSync(baseDir)) return [];

    const found: SkillSource[] = [];

    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const dir = join(baseDir, entry.name);

        if (!existsSync(join(dir, 'SKILL.md'))) continue;

        if (!SKILL_NAME.test(entry.name)) {
            warnings.push(
                `skill '${entry.name}' in ${baseDir} skipped: names must be lowercase letters, digits and hyphens`,
            );
            continue;
        }

        found.push({ name: entry.name, dir, source });
    }

    return found;
}

/**
 * The skills a CLI ships: apijack's built-ins (unless turned off) merged with
 * the CLI's own. A CLI skill replaces a built-in of the same name.
 */
export function collectSkillSources(opts: {
    builtinDir: string;
    projectDir?: string;
    includeBuiltin: boolean;
    cli: string;
}): { sources: SkillSource[]; warnings: string[] } {
    const warnings: string[] = [];
    const byName = new Map<string, SkillSource>();

    if (opts.includeBuiltin) {
        for (const s of scan(opts.builtinDir, 'builtin', warnings)) {
            if (BARE_APIJACK_ONLY.has(s.name) && opts.cli !== 'apijack') continue;

            byName.set(s.name, s);
        }
    }

    if (opts.projectDir) {
        for (const s of scan(opts.projectDir, 'project', warnings)) {
            byName.set(s.name, s);
        }
    }

    const sources = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

    return { sources, warnings };
}
