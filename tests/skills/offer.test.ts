import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { offerSkillsInstall } from '../../src/skills/offer';
import { skillsInstallAction, type SkillsContext } from '../../src/commands/skills/skills';
import { collectSkillSources } from '../../src/skills/sources';
import { readCliState, patchCliState } from '../../src/skills/state';

let root: string;
let ctx: SkillsContext;
let asked: string[];

const ask = (answer: string) => async (q: string) => {
    asked.push(q);

    return answer;
};
const install = () => {
    skillsInstallAction(ctx, [], {});
};

beforeEach(() => {
    root = join(tmpdir(), `apijack-skills-offer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const sourcesDir = join(root, 'sources');
    mkdirSync(join(sourcesDir, 'a'), { recursive: true });
    writeFileSync(join(sourcesDir, 'a', 'SKILL.md'), 'x');
    mkdirSync(join(root, 'claude'), { recursive: true });
    asked = [];
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
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('offerSkillsInstall()', () => {
    test('an empty answer installs, with the exact prompt', async () => {
        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask(''), install })).toBe('installed');
        expect(asked).toEqual([`Install Claude Code skills for mycli? (writes to ${ctx.skillsDir}) [Y/n] `]);
        expect(existsSync(join(ctx.skillsDir, 'mycli-a'))).toBe(true);
    });

    test('"n" declines and the decline is remembered', async () => {
        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask('n'), install })).toBe('declined');
        expect(readCliState(ctx.statePath, 'mycli').declined).toBe(true);
        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask(''), install })).toBe('skipped');
    });

    test('skipped when the Claude dir does not exist', async () => {
        rmSync(ctx.claudeDir, { recursive: true });

        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask(''), install })).toBe('skipped');
        expect(asked).toEqual([]);
    });

    test('skipped when not a TTY, when already installed, or after a decline', async () => {
        expect(await offerSkillsInstall(ctx, { isTTY: false, ask: ask(''), install })).toBe('skipped');

        install();
        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask(''), install })).toBe('skipped');

        rmSync(ctx.skillsDir, { recursive: true });
        patchCliState(ctx.statePath, 'mycli', { declined: true });
        expect(await offerSkillsInstall(ctx, { isTTY: true, ask: ask(''), install })).toBe('skipped');
        expect(asked).toEqual([]);
    });
});
