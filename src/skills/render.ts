import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import type { SkillSource } from './sources';

export const MARKER_FILE = '.apijack-skill.json';

export type RenderedSkill = {
    skill: string;
    installName: string;
    source: SkillSource['source'];
    files: { path: string; content: Uint8Array }[];
    hash: string;
};

/** `<cli>-<skill>`, with the display name lowercased and reduced to `[a-z0-9-]`. */
export function installNameFor(cli: string, skill: string): string {
    const slug = cli.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    return `${slug}-${skill}`;
}

function listFiles(dir: string): string[] {
    const out: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) out.push(...listFiles(full));
        else if (entry.isFile()) out.push(full);
    }

    return out;
}

/** Point the frontmatter `name:` at the install name, adding frontmatter if there is none. */
function withName(markdown: string, name: string): string {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);

    if (!fm) return `---\nname: ${name}\n---\n${markdown}`;

    const lines = fm[1]!.split(/\r?\n/);
    const idx = lines.findIndex(l => /^name\s*:/.test(l));

    if (idx >= 0) lines[idx] = `name: ${name}`;
    else lines.unshift(`name: ${name}`);

    return `---\n${lines.join('\n')}\n---\n${markdown.slice(fm[0].length)}`;
}

/** The files to install for one skill, as this CLI will see them, plus a hash of exactly that output. */
export function renderSkill(src: SkillSource, cli: string): RenderedSkill {
    const installName = installNameFor(cli, src.name);
    const encoder = new TextEncoder();
    const files = listFiles(src.dir)
        .map(full => ({ full, path: relative(src.dir, full).split(sep).join('/') }))
        .filter(f => f.path !== MARKER_FILE)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(({ full, path }) => {
            const raw = readFileSync(full);

            if (!path.endsWith('.md')) return { path, content: new Uint8Array(raw) };

            let text = raw.toString('utf-8').replaceAll('{{cli}}', cli);

            if (path === 'SKILL.md') text = withName(text, installName);

            return { path, content: encoder.encode(text) };
        });

    const hash = createHash('sha256');

    for (const f of files) {
        hash.update(f.path);
        hash.update('\0');
        hash.update(f.content);
        hash.update('\0');
    }

    return { skill: src.name, installName, source: src.source, files, hash: `sha256:${hash.digest('hex')}` };
}
