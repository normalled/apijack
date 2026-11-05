import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { collectSkillSources } from '../../src/skills/sources';
import { BUILTIN_SKILLS_DIR } from '../../src/skills/paths';

const root = join(tmpdir(), 'apijack-skill-sources-' + Date.now());
const builtinDir = join(root, 'builtin');
const projectDir = join(root, 'project');

function skill(base: string, name: string, body = '---\nname: x\n---\nbody\n') {
    mkdirSync(join(base, name), { recursive: true });
    writeFileSync(join(base, name, 'SKILL.md'), body);
}

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('collectSkillSources()', () => {
    test('collects builtin and project skills; project overrides builtin by name', () => {
        skill(builtinDir, 'write-routine');
        skill(projectDir, 'write-routine');
        skill(projectDir, 'deploy');

        const { sources } = collectSkillSources({ builtinDir, projectDir, includeBuiltin: true, cli: 'mycli' });

        expect(sources.map(s => s.name).sort()).toEqual(['deploy', 'write-routine']);
        expect(sources.find(s => s.name === 'write-routine')).toEqual({
            name: 'write-routine',
            dir: join(projectDir, 'write-routine'),
            source: 'project',
        });
    });

    test('setup-api only for the bare apijack CLI', () => {
        skill(builtinDir, 'setup-api');
        skill(builtinDir, 'write-routine');

        const bare = collectSkillSources({ builtinDir, includeBuiltin: true, cli: 'apijack' });
        const named = collectSkillSources({ builtinDir, includeBuiltin: true, cli: 'mycli' });

        expect(bare.sources.map(s => s.name).sort()).toEqual(['setup-api', 'write-routine']);
        expect(named.sources.map(s => s.name)).toEqual(['write-routine']);
    });

    test('includeBuiltin: false drops built-ins', () => {
        skill(builtinDir, 'write-routine');
        skill(projectDir, 'deploy');

        const { sources } = collectSkillSources({ builtinDir, projectDir, includeBuiltin: false, cli: 'mycli' });

        expect(sources.map(s => s.name)).toEqual(['deploy']);
    });

    test('skips directories without SKILL.md, and invalid names with a warning', () => {
        mkdirSync(join(projectDir, 'no-skill-file'), { recursive: true });
        skill(projectDir, 'Bad_Name');
        skill(projectDir, 'good');

        const { sources, warnings } = collectSkillSources({ builtinDir, projectDir, includeBuiltin: true, cli: 'mycli' });

        expect(sources.map(s => s.name)).toEqual(['good']);
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain('Bad_Name');
    });

    test('follows a symlinked skill directory', () => {
        skill(join(root, 'elsewhere'), 'linked');
        mkdirSync(projectDir, { recursive: true });
        symlinkSync(join(root, 'elsewhere', 'linked'), join(projectDir, 'linked'));

        const { sources, warnings } = collectSkillSources({ builtinDir, projectDir, includeBuiltin: true, cli: 'mycli' });

        expect(sources.map(s => s.name)).toEqual(['linked']);
        expect(warnings).toEqual([]);
    });

    test('a broken symlinked skill directory is a warning', () => {
        mkdirSync(projectDir, { recursive: true });
        symlinkSync(join(root, 'nowhere'), join(projectDir, 'dangling'));

        const { sources, warnings } = collectSkillSources({ builtinDir, projectDir, includeBuiltin: true, cli: 'mycli' });

        expect(sources).toEqual([]);
        expect(warnings.join('\n')).toContain('dangling');
    });

    test('a missing project or builtin dir yields no sources and no warnings', () => {
        const { sources, warnings } = collectSkillSources({
            builtinDir: join(root, 'nope'),
            projectDir: join(root, 'nope2'),
            includeBuiltin: true,
            cli: 'mycli',
        });

        expect(sources).toEqual([]);
        expect(warnings).toEqual([]);
    });
});

describe('built-in skills', () => {
    const names = readdirSync(BUILTIN_SKILLS_DIR);

    test('ship write-routine and setup-api', () => {
        expect(names.sort()).toEqual(['setup-api', 'write-routine']);
    });

    for (const name of names) {
        test(`${name} contains no MCP tool references and uses {{cli}}`, () => {
            const text = readFileSync(join(BUILTIN_SKILLS_DIR, name, 'SKILL.md'), 'utf-8');

            expect(text).not.toMatch(
                /\b(create_routine|run_routine|run_commands|list_commands|describe_command|get_routine_templates)\b/,
            );
            expect(text).not.toMatch(/\bMCP\b/);
            expect(text).not.toContain('<cli>');
            expect(text).toContain('{{cli}}');
        });
    }

    test('write-routine description names the CLI via {{cli}}', () => {
        const text = readFileSync(join(BUILTIN_SKILLS_DIR, 'write-routine', 'SKILL.md'), 'utf-8');
        const description = /^description: (.*)$/m.exec(text)?.[1] ?? '';

        expect(description).toContain('{{cli}}');
        expect(description).not.toContain('apijack');
    });

    test('setup-api does not suggest running setup through Claude Code bash mode', () => {
        const text = readFileSync(join(BUILTIN_SKILLS_DIR, 'setup-api', 'SKILL.md'), 'utf-8');

        expect(text).not.toContain('! {{cli}} setup');
    });

    test('write-routine points at routine dir and validate', () => {
        const text = readFileSync(join(BUILTIN_SKILLS_DIR, 'write-routine', 'SKILL.md'), 'utf-8');

        expect(text).toContain('{{cli}} routine dir');
        expect(text).toContain('{{cli}} routine validate');
        expect(text.split('\n').length).toBeLessThan(500);
    });
});
