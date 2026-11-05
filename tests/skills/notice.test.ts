import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { skillsNotice, type Invocation } from '../../src/skills/notice';
import { skillsInstallAction, type SkillsContext } from '../../src/commands/skills/skills';
import { collectSkillSources } from '../../src/skills/sources';
import { patchCliState, readCliState } from '../../src/skills/state';

let root: string;
let sourcesDir: string;
let ctx: SkillsContext;
const NOW = new Date('2026-11-05T12:00:00.000Z');
const MESSAGE = "mycli: Claude Code skills have changed. Run 'mycli skills update'";

function addSource(name: string, body = `---\nname: ${name}\n---\nv1\n`) {
    mkdirSync(join(sourcesDir, name), { recursive: true });
    writeFileSync(join(sourcesDir, name, 'SKILL.md'), body);
}

function inv(overrides: Partial<Invocation> = {}): Invocation {
    return { stdoutTTY: true, stderrTTY: true, argv: ['things', 'list'], command: 'things', subcommand: 'list', ...overrides };
}

beforeEach(() => {
    root = join(tmpdir(), `apijack-skills-notice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sourcesDir = join(root, 'sources');
    ctx = {
        cli: 'mycli',
        claudeDir: join(root, 'claude'),
        skillsDir: join(root, 'claude', 'skills'),
        statePath: join(root, 'state.json'),
        marketplaceDir: join(root, 'no-marketplace'),
        loadSources: () => collectSkillSources({
            builtinDir: join(root, 'none'), projectDir: sourcesDir, includeBuiltin: false, cli: 'mycli',
        }).sources,
    };
    addSource('a');
    addSource('b');
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function makeOutdated() {
    skillsInstallAction(ctx, [], {});
    writeFileSync(join(sourcesDir, 'a', 'SKILL.md'), '---\nname: a\n---\nv2\n');
}

describe('skillsNotice()', () => {
    test('fires for an outdated install and records lastNotice', () => {
        makeOutdated();

        expect(skillsNotice(ctx, inv(), NOW)).toBe(MESSAGE);
        expect(readCliState(ctx.statePath, 'mycli').lastNotice).toBe(NOW.toISOString());
    });

    test('does not fire within 24 hours of the last notice', () => {
        makeOutdated();
        patchCliState(ctx.statePath, 'mycli', { lastNotice: new Date(NOW.getTime() - 23 * 3600_000).toISOString() });

        expect(skillsNotice(ctx, inv(), NOW)).toBeNull();
        patchCliState(ctx.statePath, 'mycli', { lastNotice: new Date(NOW.getTime() - 25 * 3600_000).toISOString() });
        expect(skillsNotice(ctx, inv(), NOW)).toBe(MESSAGE);
    });

    test('does not fire when stdout or stderr is not a TTY', () => {
        makeOutdated();

        expect(skillsNotice(ctx, inv({ stdoutTTY: false }), NOW)).toBeNull();
        expect(skillsNotice(ctx, inv({ stderrTTY: false }), NOW)).toBeNull();
    });

    test('does not fire for machine-readable or quiet output', () => {
        makeOutdated();

        for (const flag of [['--json'], ['-o', 'json'], ['-o=json'], ['-ojson'], ['--quiet']]) {
            expect(skillsNotice(ctx, inv({ argv: ['things', 'list', ...flag] }), NOW)).toBeNull();
        }
    });

    test('does not fire for skills, mcp, or routine run', () => {
        makeOutdated();

        expect(skillsNotice(ctx, inv({ command: 'skills', subcommand: 'status' }), NOW)).toBeNull();
        expect(skillsNotice(ctx, inv({ command: 'mcp', subcommand: undefined }), NOW)).toBeNull();
        expect(skillsNotice(ctx, inv({ command: 'routine', subcommand: 'run' }), NOW)).toBeNull();
    });

    test('does not fire when nothing is installed', () => {
        expect(skillsNotice(ctx, inv(), NOW)).toBeNull();
    });

    test('does not fire when everything is up to date', () => {
        skillsInstallAction(ctx, [], {});

        expect(skillsNotice(ctx, inv(), NOW)).toBeNull();
    });

    test('fires for a skill added since seen, not for one the user left out', () => {
        skillsInstallAction(ctx, ['a'], {});
        expect(skillsNotice(ctx, inv(), NOW)).toBeNull();

        addSource('c');
        expect(skillsNotice(ctx, inv(), NOW)).toBe(MESSAGE);
    });
});
