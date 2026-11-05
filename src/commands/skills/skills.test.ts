import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Command } from 'commander';
import {
    LEFTOVER_PLUGIN_WARNING,
    registerSkillsCommand,
    skillsInstallAction,
    skillsStatusAction,
    skillsAfterUpdateAction,
    skillsUninstallAction,
    skillsUpdateAction,
    type SkillsContext,
} from './skills';
import { collectSkillSources } from '../../skills/sources';
import { patchCliState, readCliState } from '../../skills/state';

let root: string;
let sourcesDir: string;
let ctx: SkillsContext;

function addSource(name: string, body = `---\nname: ${name}\n---\nuse {{cli}}\n`) {
    mkdirSync(join(sourcesDir, name), { recursive: true });
    writeFileSync(join(sourcesDir, name, 'SKILL.md'), body);
}

beforeEach(() => {
    root = join(tmpdir(), `apijack-skills-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sourcesDir = join(root, 'sources');
    mkdirSync(join(root, 'claude'), { recursive: true });
    ctx = {
        cli: 'mycli',
        claudeDir: join(root, 'claude'),
        skillsDir: join(root, 'claude', 'skills'),
        statePath: join(root, 'home', '.apijack', 'skills-state.json'),
        marketplaceDir: join(root, 'home', '.apijack', 'plugin-marketplace'),
        loadSources: () => collectSkillSources({
            builtinDir: join(root, 'none'),
            projectDir: sourcesDir,
            includeBuiltin: false,
            cli: 'mycli',
        }).sources,
    };
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

const installed = (name: string) => existsSync(join(ctx.skillsDir, `mycli-${name}`, 'SKILL.md'));

describe('skills install', () => {
    test('writes all skills, records seen, and reports paths', () => {
        addSource('a');
        addSource('b');

        const result = skillsInstallAction(ctx, [], {});

        expect(installed('a')).toBe(true);
        expect(installed('b')).toBe(true);
        expect(readFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toContain('use mycli');
        expect(readCliState(ctx.statePath, 'mycli').seen).toEqual(['a', 'b']);
        expect(result.lines.join('\n')).toContain(ctx.skillsDir);
    });

    test('install <name> installs only that skill but records every source as seen', () => {
        addSource('a');
        addSource('b');

        skillsInstallAction(ctx, ['a'], {});

        expect(installed('a')).toBe(true);
        expect(installed('b')).toBe(false);
        expect(readCliState(ctx.statePath, 'mycli').seen).toEqual(['a', 'b']);
    });

    test('an unknown skill name is a warning', () => {
        addSource('a');

        const result = skillsInstallAction(ctx, ['nope'], {});

        expect(result.warnings.join('\n')).toContain("unknown skill 'nope'");
    });

    test('skips a conflict with a warning; --force overwrites it', () => {
        addSource('a');
        mkdirSync(join(ctx.skillsDir, 'mycli-a'), { recursive: true });
        writeFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'user content');

        const skipped = skillsInstallAction(ctx, [], {});
        expect(skipped.warnings.join('\n')).toContain('mycli-a');
        expect(readFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toBe('user content');

        skillsInstallAction(ctx, [], { force: true });
        expect(readFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toContain('use mycli');
    });

    test('prints the reload hint only when it created the skills dir', () => {
        addSource('a');

        const first = skillsInstallAction(ctx, [], {});
        const second = skillsInstallAction(ctx, [], {});

        const hint = `Created ${ctx.skillsDir}. Running Claude Code sessions need /reload-skills to see it.`;
        expect(first.lines).toContain(hint);
        expect(second.lines).not.toContain(hint);
    });
});

describe('skills update', () => {
    test('refreshes outdated, installs skills added since seen, removes orphans, leaves skipped ones alone', () => {
        addSource('a');
        addSource('skipped');
        addSource('gone');
        skillsInstallAction(ctx, ['a', 'gone'], {});

        writeFileSync(join(sourcesDir, 'a', 'SKILL.md'), '---\nname: a\n---\nv2 {{cli}}\n');
        rmSync(join(sourcesDir, 'gone'), { recursive: true });
        addSource('new');

        const result = skillsUpdateAction(ctx, {});

        expect(readFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toContain('v2 mycli');
        expect(installed('new')).toBe(true);
        expect(installed('gone')).toBe(false);
        expect(installed('skipped')).toBe(false);
        expect(result.lines.join('\n')).toMatch(/updated mycli-a/);
        expect(result.lines.join('\n')).toMatch(/installed mycli-new/);
        expect(result.lines.join('\n')).toMatch(/removed mycli-gone/);
        expect(readCliState(ctx.statePath, 'mycli').seen).toEqual(['a', 'new', 'skipped']);
    });

    test('with nothing installed it says to run install; with ifInstalled it prints nothing', () => {
        addSource('a');

        expect(skillsUpdateAction(ctx, {}).lines.join('\n')).toContain("Run 'mycli skills install'");
        expect(skillsUpdateAction(ctx, { ifInstalled: true })).toEqual({ lines: [], warnings: [] });
        expect(installed('a')).toBe(false);
    });
});

describe('output names the skills directory', () => {
    test('update says where skills are, whether or not anything changed', () => {
        addSource('a');
        skillsInstallAction(ctx, [], {});

        expect(skillsUpdateAction(ctx, {}).lines.join('\n')).toContain(ctx.skillsDir);

        writeFileSync(join(sourcesDir, 'a', 'SKILL.md'), '---\nname: a\n---\nv2\n');
        expect(skillsUpdateAction(ctx, {}).lines.join('\n')).toContain(ctx.skillsDir);
    });

    test('uninstall says where it removed skills from', () => {
        addSource('a');
        skillsInstallAction(ctx, [], {});

        expect(skillsUninstallAction(ctx).lines.join('\n')).toContain(ctx.skillsDir);
    });
});

describe('skills uninstall / status', () => {
    test('uninstall removes only owned directories', () => {
        addSource('a');
        skillsInstallAction(ctx, [], {});
        mkdirSync(join(ctx.skillsDir, 'mycli-mine'), { recursive: true });
        writeFileSync(join(ctx.skillsDir, 'mycli-mine', 'SKILL.md'), 'user');

        skillsUninstallAction(ctx);

        expect(installed('a')).toBe(false);
        expect(existsSync(join(ctx.skillsDir, 'mycli-mine', 'SKILL.md'))).toBe(true);
    });

    test('status reports each skill', () => {
        addSource('a');
        addSource('b');
        skillsInstallAction(ctx, ['a'], {});

        expect(skillsStatusAction(ctx).entries).toEqual([
            { skill: 'a', installName: 'mycli-a', status: 'up to date' },
            { skill: 'b', installName: 'mycli-b', status: 'not installed' },
        ]);
    });
});

describe('leftover plugin notice', () => {
    test('appears for install, update and status when the old marketplace dir exists', () => {
        addSource('a');
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        expect(skillsInstallAction(ctx, [], {}).warnings).toContain(LEFTOVER_PLUGIN_WARNING);
        expect(skillsUpdateAction(ctx, {}).warnings).toContain(LEFTOVER_PLUGIN_WARNING);
        expect(skillsStatusAction(ctx).warnings).toContain(LEFTOVER_PLUGIN_WARNING);
        expect(LEFTOVER_PLUGIN_WARNING).toBe(
            'The old apijack Claude Code plugin is still installed and may duplicate these skills. If no other CLI needs it: claude plugin uninstall apijack@apijack',
        );
    });

    test('is absent when the marketplace dir does not exist', () => {
        addSource('a');

        expect(skillsInstallAction(ctx, [], {}).warnings).not.toContain(LEFTOVER_PLUGIN_WARNING);
    });
});

describe('registerSkillsCommand()', () => {
    test('registers install, update, status, uninstall; update takes no options', () => {
        const program = new Command();
        registerSkillsCommand(program, ctx);
        const skills = program.commands.find(c => c.name() === 'skills')!;

        expect(skills.commands.map(c => c.name())).toEqual(['install', 'update', 'status', 'uninstall']);
        expect(skills.commands.find(c => c.name() === 'update')!.options).toEqual([]);
    });
});

describe('skillsAfterUpdateAction() (runs after an upgrade)', () => {
    test('does nothing when no skills are installed and the old plugin is absent', () => {
        addSource('a');

        expect(skillsAfterUpdateAction(ctx)).toEqual({ lines: [], warnings: [] });
        expect(installed('a')).toBe(false);
    });

    test('migrates: installs the skills when the old plugin is present and nothing is installed yet', () => {
        addSource('a');
        addSource('b');
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        const result = skillsAfterUpdateAction(ctx);

        expect(installed('a')).toBe(true);
        expect(installed('b')).toBe(true);
        expect(result.lines[0]).toBe("mycli's Claude Code skills now install as personal skills; installing them:");
        expect(readCliState(ctx.statePath, 'mycli').seen).toEqual(['a', 'b']);
    });

    test('does not migrate a CLI that installed skills before (e.g. after skills uninstall)', () => {
        addSource('a');
        skillsInstallAction(ctx, [], {});
        skillsUninstallAction(ctx);
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        expect(skillsAfterUpdateAction(ctx)).toEqual({ lines: [], warnings: [] });
        expect(installed('a')).toBe(false);
    });

    test('does not migrate when the user declined the setup offer', () => {
        addSource('a');
        patchCliState(ctx.statePath, 'mycli', { declined: true });
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        expect(skillsAfterUpdateAction(ctx)).toEqual({ lines: [], warnings: [] });
    });

    test('does not migrate when the CLI has no skills command to manage them', () => {
        addSource('a');
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        expect(skillsAfterUpdateAction(ctx, { allowMigration: false })).toEqual({ lines: [], warnings: [] });
        expect(installed('a')).toBe(false);
    });

    test('a conflict during migration is a warning, not a claim it was installed', () => {
        addSource('a');
        mkdirSync(join(ctx.skillsDir, 'mycli-a'), { recursive: true });
        writeFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'user content');
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        const result = skillsAfterUpdateAction(ctx);

        expect(result.lines).not.toContain('installed mycli-a');
        expect(result.warnings.join('\n')).toContain('skipped mycli-a');
        expect(readFileSync(join(ctx.skillsDir, 'mycli-a', 'SKILL.md'), 'utf-8')).toBe('user content');
    });

    test('updates as usual once skills are installed', () => {
        addSource('a');
        skillsInstallAction(ctx, [], {});
        writeFileSync(join(sourcesDir, 'a', 'SKILL.md'), '---\nname: a\n---\nv2 {{cli}}\n');
        mkdirSync(ctx.marketplaceDir, { recursive: true });

        const result = skillsAfterUpdateAction(ctx);

        expect(result.lines.join('\n')).toContain('updated mycli-a');
        expect(result.lines.join('\n')).not.toContain('installed for you');
    });
});
