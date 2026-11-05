import type { SkillsContext } from '../commands/skills/skills';
import { renderSkill } from './render';
import { ownedInstalls, skillStatuses } from './store';
import { patchCliState, readCliState } from './state';

export type Invocation = {
    stdoutTTY: boolean;
    stderrTTY: boolean;
    argv: string[];
    command?: string;
    subcommand?: string;
};

const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isMachineOrQuiet(argv: string[]): boolean {
    return argv.some(a => a === '--json' || a === '--quiet' || a === '-o' || a.startsWith('-o'));
}

function eligible(inv: Invocation): boolean {
    if (!inv.stdoutTTY || !inv.stderrTTY) return false;

    if (isMachineOrQuiet(inv.argv)) return false;

    if (inv.command === 'skills' || inv.command === 'mcp') return false;

    return !(inv.command === 'routine' && inv.subcommand === 'run');
}

/**
 * The one-line "skills have changed" notice, or null. Checks run cheapest
 * first; when it fires, the time is recorded so it shows at most once a day.
 */
export function skillsNotice(ctx: SkillsContext, inv: Invocation, now: Date = new Date()): string | null {
    if (!eligible(inv)) return null;

    const state = readCliState(ctx.statePath, ctx.cli);
    const last = state.lastNotice ? Date.parse(state.lastNotice) : NaN;

    if (!Number.isNaN(last) && now.getTime() - last < NOTICE_INTERVAL_MS) return null;

    if (ownedInstalls(ctx.cli, ctx.skillsDir).length === 0) return null;

    const rendered = ctx.loadSources().map(s => renderSkill(s, ctx.cli));
    const seen = state.seen ? new Set(state.seen) : null;
    const changed = skillStatuses(ctx.cli, rendered, ctx.skillsDir).some(e =>
        e.status === 'outdated'
        || e.status === 'orphaned'
        || (e.status === 'not installed' && seen !== null && !seen.has(e.skill)),
    );

    if (!changed) return null;

    patchCliState(ctx.statePath, ctx.cli, { lastNotice: now.toISOString() });

    return `${ctx.cli}: Claude Code skills have changed. Run '${ctx.cli} skills update'`;
}
