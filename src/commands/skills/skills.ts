import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { renderSkill, type RenderedSkill } from '../../skills/render';
import type { SkillSource } from '../../skills/sources';
import {
    ownedInstalls,
    removeOwned,
    skillStatuses,
    writeSkill,
    type SkillStatusEntry,
} from '../../skills/store';
import { patchCliState, readCliState } from '../../skills/state';

export type SkillsContext = {
    /** Display name: prefixes install names and fills `{{cli}}`. */
    cli: string;
    skillsDir: string;
    claudeDir: string;
    statePath: string;
    /** The old Claude Code plugin's marketplace dir; its presence triggers the leftover notice. */
    marketplaceDir: string;
    loadSources: () => SkillSource[];
};

export type SkillsActionResult = { lines: string[]; warnings: string[] };

export const LEFTOVER_PLUGIN_WARNING = [
    'The old apijack Claude Code plugin is still installed and may duplicate these skills.',
    'If no other CLI needs it: claude plugin uninstall apijack@apijack',
].join(' ');

function leftoverWarnings(ctx: SkillsContext): string[] {
    return existsSync(ctx.marketplaceDir) ? [LEFTOVER_PLUGIN_WARNING] : [];
}

function renderAll(ctx: SkillsContext): { sources: SkillSource[]; rendered: RenderedSkill[] } {
    const sources = ctx.loadSources();

    return { sources, rendered: sources.map(s => renderSkill(s, ctx.cli)) };
}

function conflictWarning(ctx: SkillsContext, installName: string): string {
    return `skipped ${installName}: ${join(ctx.skillsDir, installName)} exists and wasn't installed by ${ctx.cli}`;
}

export function skillsInstallAction(
    ctx: SkillsContext,
    names: string[],
    opts: { force?: boolean },
): SkillsActionResult {
    const lines: string[] = [];
    const warnings: string[] = [];
    const { sources, rendered } = renderAll(ctx);
    const createdDir = !existsSync(ctx.skillsDir);

    for (const name of names) {
        if (!sources.some(s => s.name === name)) warnings.push(`unknown skill '${name}'`);
    }

    const selected = names.length > 0 ? rendered.filter(r => names.includes(r.skill)) : rendered;
    const status = new Map(skillStatuses(ctx.cli, selected, ctx.skillsDir).map(e => [e.skill, e.status]));

    for (const r of selected) {
        if (status.get(r.skill) === 'conflict' && !opts.force) {
            warnings.push(`${conflictWarning(ctx, r.installName)} (use --force to overwrite)`);
            continue;
        }

        writeSkill(r, ctx.cli, ctx.skillsDir);
        lines.push(`installed ${r.installName}`);
    }

    patchCliState(ctx.statePath, ctx.cli, { seen: sources.map(s => s.name) });

    if (lines.length > 0) lines.push(`Skills written to ${ctx.skillsDir}`);

    if (createdDir && existsSync(ctx.skillsDir)) {
        lines.push(`Created ${ctx.skillsDir}. Running Claude Code sessions need /reload-skills to see it.`);
    }

    return { lines, warnings: [...warnings, ...leftoverWarnings(ctx)] };
}

export function skillsUpdateAction(ctx: SkillsContext, opts: { ifInstalled?: boolean }): SkillsActionResult {
    if (ownedInstalls(ctx.cli, ctx.skillsDir).length === 0) {
        if (opts.ifInstalled) return { lines: [], warnings: [] };

        return {
            lines: [`No skills installed for ${ctx.cli}. Run '${ctx.cli} skills install'.`],
            warnings: leftoverWarnings(ctx),
        };
    }

    const lines: string[] = [];
    const warnings: string[] = [];
    const { sources, rendered } = renderAll(ctx);
    // No record of what existed at the last install: treat every current skill
    // as seen, so update never installs something the user may have left out.
    const seen = new Set(readCliState(ctx.statePath, ctx.cli).seen ?? sources.map(s => s.name));
    const byName = new Map(rendered.map(r => [r.skill, r]));

    for (const entry of skillStatuses(ctx.cli, rendered, ctx.skillsDir)) {
        const r = byName.get(entry.skill);

        if (entry.status === 'outdated' && r) {
            writeSkill(r, ctx.cli, ctx.skillsDir);
            lines.push(`updated ${entry.installName}`);
        } else if (entry.status === 'not installed' && r && !seen.has(entry.skill)) {
            writeSkill(r, ctx.cli, ctx.skillsDir);
            lines.push(`installed ${entry.installName}`);
        } else if (entry.status === 'conflict' && !seen.has(entry.skill)) {
            warnings.push(conflictWarning(ctx, entry.installName));
        } else if (entry.status === 'orphaned' && removeOwned(join(ctx.skillsDir, entry.installName), ctx.cli)) {
            lines.push(`removed ${entry.installName}`);
        }
    }

    patchCliState(ctx.statePath, ctx.cli, { seen: sources.map(s => s.name) });

    lines.push(lines.length === 0
        ? `Skills for ${ctx.cli} are up to date in ${ctx.skillsDir}`
        : `Skills updated in ${ctx.skillsDir}`);

    return { lines, warnings: [...warnings, ...leftoverWarnings(ctx)] };
}

export function skillsStatusAction(ctx: SkillsContext): { entries: SkillStatusEntry[]; warnings: string[] } {
    const { rendered } = renderAll(ctx);

    return { entries: skillStatuses(ctx.cli, rendered, ctx.skillsDir), warnings: leftoverWarnings(ctx) };
}

export function skillsUninstallAction(ctx: SkillsContext): SkillsActionResult {
    const lines: string[] = [];

    for (const { dir, marker } of ownedInstalls(ctx.cli, ctx.skillsDir)) {
        if (removeOwned(dir, ctx.cli)) lines.push(`removed ${dir.slice(ctx.skillsDir.length + 1)} (${marker.skill})`);
    }

    lines.push(lines.length === 0
        ? `No skills installed for ${ctx.cli} in ${ctx.skillsDir}.`
        : `Removed from ${ctx.skillsDir}`);

    return { lines, warnings: [] };
}

export function printSkillsResult(result: SkillsActionResult): void {
    for (const line of result.lines) console.log(line);

    for (const w of result.warnings) process.stderr.write(`${w}\n`);
}

export function registerSkillsCommand(program: Command, ctx: SkillsContext): void {
    const skills = program
        .command('skills')
        .description('Install this CLI\'s Claude Code skills');

    skills
        .command('install [names...]')
        .description(`Install or refresh skills in ${ctx.skillsDir}`)
        .option('--force', 'Overwrite a skill directory this CLI did not install')
        .action((names: string[], opts: { force?: boolean }) => printSkillsResult(skillsInstallAction(ctx, names, opts)));

    skills
        .command('update')
        .description('Refresh changed skills, add new ones, remove ones this CLI no longer ships')
        .action(() => printSkillsResult(skillsUpdateAction(ctx, {})));

    skills
        .command('status')
        .description('Show each skill\'s install status')
        .option('--json', 'Print as JSON')
        .action((opts: { json?: boolean }) => {
            const { entries, warnings } = skillsStatusAction(ctx);

            if (opts.json) {
                console.log(JSON.stringify(entries, null, 2));
            } else if (entries.length === 0) {
                console.log(`${ctx.cli} ships no skills.`);
            } else {
                for (const e of entries) console.log(`  ${e.installName.padEnd(40)} ${e.status}`);
            }

            for (const w of warnings) process.stderr.write(`${w}\n`);
        });

    skills
        .command('uninstall')
        .description('Remove every skill this CLI installed')
        .action(() => printSkillsResult(skillsUninstallAction(ctx)));
}
