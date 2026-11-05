import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installNameFor, renderSkill } from '../../src/skills/render';
import type { SkillSource } from '../../src/skills/sources';

const root = join(tmpdir(), 'apijack-skill-render-' + Date.now());

function source(files: Record<string, string>, name = 'write-routine'): SkillSource {
    const dir = join(root, name);

    for (const [rel, content] of Object.entries(files)) {
        mkdirSync(join(dir, rel, '..'), { recursive: true });
        writeFileSync(join(dir, rel), content);
    }

    return { name, dir, source: 'builtin' };
}

const text = (r: ReturnType<typeof renderSkill>, path: string) =>
    new TextDecoder().decode(r.files.find(f => f.path === path)!.content);

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('installNameFor()', () => {
    test('slugs the display name and prefixes the skill', () => {
        expect(installNameFor('My CLI', 'write-routine')).toBe('my-cli-write-routine');
        expect(installNameFor('acme2', 'x')).toBe('acme2-x');
        expect(installNameFor('--Acme__Tool--', 'x')).toBe('acme-tool-x');
    });
});

describe('renderSkill()', () => {
    test('replaces {{cli}} in .md files only', () => {
        const r = renderSkill(source({
            'SKILL.md': '---\nname: write-routine\n---\nrun {{cli}} routine\n',
            'scripts/run.sh': 'echo {{cli}}\n',
        }), 'mycli');

        expect(text(r, 'SKILL.md')).toContain('run mycli routine');
        expect(text(r, 'scripts/run.sh')).toBe('echo {{cli}}\n');
    });

    test('rewrites the name: frontmatter to the install name', () => {
        const r = renderSkill(source({ 'SKILL.md': '---\nname: write-routine\ndescription: d\n---\nbody\n' }), 'mycli');

        expect(r.installName).toBe('mycli-write-routine');
        expect(text(r, 'SKILL.md')).toBe('---\nname: mycli-write-routine\ndescription: d\n---\nbody\n');
    });

    test('adds name: to frontmatter that lacks it', () => {
        const r = renderSkill(source({ 'SKILL.md': '---\ndescription: d\n---\nbody\n' }), 'mycli');

        expect(text(r, 'SKILL.md')).toBe('---\nname: mycli-write-routine\ndescription: d\n---\nbody\n');
    });

    test('adds frontmatter when SKILL.md has none', () => {
        const r = renderSkill(source({ 'SKILL.md': 'body\n' }), 'mycli');

        expect(text(r, 'SKILL.md').startsWith('---\nname: mycli-write-routine\n---\n')).toBe(true);
    });

    test('hash is stable and changes with content or cli name', () => {
        const src = source({ 'SKILL.md': '---\nname: w\n---\nrun {{cli}}\n' });
        const a = renderSkill(src, 'mycli');
        const b = renderSkill(src, 'mycli');
        const c = renderSkill(src, 'other');

        expect(a.hash).toBe(b.hash);
        expect(a.hash).not.toBe(c.hash);
        expect(a.hash.startsWith('sha256:')).toBe(true);

        writeFileSync(join(src.dir, 'SKILL.md'), '---\nname: w\n---\nchanged\n');
        expect(renderSkill(src, 'mycli').hash).not.toBe(a.hash);
    });

    test('includes supporting files recursively, sorted by path, without a stray marker file', () => {
        const r = renderSkill(source({
            'SKILL.md': 'x',
            'z.md': 'z',
            'ref/a.md': 'a',
            '.apijack-skill.json': '{}',
        }), 'mycli');

        expect(r.files.map(f => f.path)).toEqual(['SKILL.md', 'ref/a.md', 'z.md']);
        expect(r.skill).toBe('write-routine');
        expect(r.source).toBe('builtin');
    });
});
