import { existsSync } from 'fs';
import type { SkillsContext } from '../commands/skills/skills';
import { ownedInstalls } from './store';
import { patchCliState, readCliState } from './state';

/**
 * Offer to install this CLI's skills after setup. Only asks in a terminal, when
 * Claude Code looks installed, nothing is installed yet, and the user hasn't
 * said no before. A "no" is remembered.
 */
export async function offerSkillsInstall(
    ctx: SkillsContext,
    deps: { isTTY: boolean; ask: (q: string) => Promise<string>; install: () => void },
): Promise<'installed' | 'declined' | 'skipped'> {
    if (!deps.isTTY || !existsSync(ctx.claudeDir)) return 'skipped';

    if (ownedInstalls(ctx.cli, ctx.skillsDir).length > 0) return 'skipped';

    if (readCliState(ctx.statePath, ctx.cli).declined) return 'skipped';

    if (ctx.loadSources().length === 0) return 'skipped';

    const answer = (await deps.ask(`Install Claude Code skills for ${ctx.cli}? (writes to ${ctx.skillsDir}) [Y/n] `))
        .trim()
        .toLowerCase();

    if (answer === '' || answer === 'y' || answer === 'yes') {
        deps.install();

        return 'installed';
    }

    patchCliState(ctx.statePath, ctx.cli, { declined: true });

    return 'declined';
}
