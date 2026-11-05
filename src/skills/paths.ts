import { homedir } from 'os';
import { join, resolve } from 'path';

type Env = Record<string, string | undefined>;

/** Claude Code's config directory: `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`. */
export function claudeDir(env: Env = process.env, home: string = homedir()): string {
    return env.CLAUDE_CONFIG_DIR || join(home, '.claude');
}

/** Where Claude Code looks for personal skills. */
export function claudeSkillsDir(env: Env = process.env, home: string = homedir()): string {
    return join(claudeDir(env, home), 'skills');
}

/** Per-user skills bookkeeping (declines, notice throttle, seen skills), keyed by CLI. */
export function skillsStatePath(home: string = homedir()): string {
    return join(home, '.apijack', 'skills-state.json');
}

/** Skills shipped with @apijack/core. */
export const BUILTIN_SKILLS_DIR = resolve(import.meta.dir, '..', '..', 'skills');
