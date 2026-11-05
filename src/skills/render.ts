import { createHash } from 'crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'fs';
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

/** `<cli>-<skill>`, with the display name lowercased and every run of non-letters/digits turned into `-`. */
export function installNameFor(cli: string, skill: string): string {
    const slug = cli.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

    if (!slug) throw new Error(`CLI name '${cli}' must contain at least one letter or digit`);

    return `${slug}-${skill}`;
}

/**
 * Every file under `dir`, following symlinks. A symlink back to one of its own
 * parent directories (a loop) is skipped; the same directory linked from two
 * places is copied under both paths.
 */
function listFiles(dir: string, skill: string, ancestors: ReadonlySet<string> = new Set()): string[] {
    const real = realpathSync(dir);

    if (ancestors.has(real)) return [];

    const chain = new Set(ancestors).add(real);

    const out: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        let isDir = entry.isDirectory();
        let isFile = entry.isFile();

        if (entry.isSymbolicLink()) {
            try {
                const target = statSync(full);
                isDir = target.isDirectory();
                isFile = target.isFile();
            } catch {
                throw new Error(`skill '${skill}': broken symlink ${full}`);
            }
        }

        if (isDir) out.push(...listFiles(full, skill, chain));
        else if (isFile) out.push(full);
    }

    return out;
}

/**
 * Point the frontmatter `name:` at the install name, adding frontmatter if
 * there is none. Tolerates a BOM, CRLF, an empty block, and a closing `---`
 * at the very end of the file.
 */
function withName(markdown: string, name: string): string {
    const text = markdown.replace(/^\uFEFF/, '');
    const fm = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);

    if (!fm) return `---\nname: ${name}\n---\n${text}`;

    const lines = fm[1] ? fm[1].split(/\r?\n/) : [];
    const idx = lines.findIndex(l => /^name\s*:/.test(l));

    if (idx >= 0) lines[idx] = `name: ${name}`;
    else lines.unshift(`name: ${name}`);

    return `---\n${lines.join('\n')}\n---\n${text.slice(fm[0].length)}`;
}

/** The files to install for one skill, as this CLI will see them, plus a hash of exactly that output. */
export function renderSkill(src: SkillSource, cli: string): RenderedSkill {
    const installName = installNameFor(cli, src.name);
    const encoder = new TextEncoder();
    const files = listFiles(src.dir, src.name)
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
