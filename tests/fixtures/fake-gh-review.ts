import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Fixture builders and a runner for the review-issue script tests. The runner
// puts tests/fixtures/fake-gh-review.sh on PATH as `gh`; see that file for the
// calls it answers.

export const repoRoot = join(import.meta.dir, '..', '..');

const fakeGhPath = join(import.meta.dir, 'fake-gh-review.sh');

// Colors as created by .claude/skills/review-issue/scripts/ensure-review-labels.sh.
const labelColors: Record<string, string> = {
    'needs review': 'BFD4F2',
    'review in progress': 'FBCA04',
    'first pass reviewed': '0E8A16',
    'changes requested': 'D93F0B',
    'approved': '0E8A16',
};

export interface Label {
    id: string;
    name: string;
    description: string;
    color: string;
}

export interface Pr {
    number: number;
    headRefOid: string;
    isDraft: boolean;
    labels: Label[];
}

export interface IssueEvent {
    event: string;
    created_at: string;
    actor: { login: string };
    /** Present on `labeled` / `unlabeled` events only. */
    label?: { name: string; color: string };
}

export interface Commit {
    sha: string;
    commit: {
        author: { name: string; email: string; date: string };
        committer: { name: string; email: string; date: string };
        message: string;
    };
}

export interface CheckRun {
    id: number;
    name: string;
    head_sha: string;
    status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
}

export interface Fixture {
    repo: string;
    prs: Pr[];
    events: Record<string, IssueEvent[]>;
    commits: Record<string, Commit>;
    checkRuns: Record<string, CheckRun[]>;
    /** Head SHAs whose check-runs call fails (HTTP 502). */
    failingCheckRuns?: string[];
    /** How many label POSTs fail (HTTP 502) before they start succeeding. */
    failLabelPosts?: number;
}

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    calls: string[];
    /** The fixture after the run, including any label writes. */
    state: Fixture;
}

/** A GitHub-style UTC timestamp (no milliseconds) `minutes` before now. */
export function minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function pr(number: number, labels: string[], head: string, isDraft = false): Pr {
    return {
        number,
        headRefOid: head,
        isDraft,
        labels: labels.map(name => ({
            id: `LA_${name.replace(/ /g, '_')}`,
            name,
            description: '',
            color: labelColors[name] ?? 'ededed',
        })),
    };
}

function labelEvent(event: 'labeled' | 'unlabeled', name: string, at: string): IssueEvent {
    return {
        event,
        created_at: at,
        actor: { login: name === 'needs review' ? 'github-actions[bot]' : 'garretpremo' },
        label: { name, color: labelColors[name] ?? 'ededed' },
    };
}

export function labeled(name: string, at: string): IssueEvent {
    return labelEvent('labeled', name, at);
}

export function unlabeled(name: string, at: string): IssueEvent {
    return labelEvent('unlabeled', name, at);
}

/**
 * `count` events that aren't label changes (review requests, mentions, ...),
 * one a second from `from` onward. Pushes later events past the events API's
 * first page.
 */
export function otherEvents(count: number, from: string): IssueEvent[] {
    const kinds = ['review_requested', 'mentioned', 'subscribed', 'referenced'];
    const start = Date.parse(from);

    return Array.from({ length: count }, (_, i) => ({
        event: kinds[i % kinds.length],
        created_at: new Date(start + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        actor: { login: 'garretpremo' },
    }));
}

export function commit(sha: string, at: string): Commit {
    const who = { name: 'Garret Premo', email: 'garret@example.com', date: at };

    return { sha, commit: { author: who, committer: who, message: 'chore: work in progress' } };
}

export function checkRun(name: string, headSha: string, status: CheckRun['status'], conclusion: string | null = null): CheckRun {
    return {
        id: Math.floor(Math.random() * 1e9),
        name,
        head_sha: headSha,
        status,
        conclusion,
        started_at: status === 'queued' ? null : minutesAgo(3),
        completed_at: status === 'completed' ? minutesAgo(1) : null,
    };
}

export function fixture(parts: Partial<Fixture>): Fixture {
    return { repo: 'normalled/apijack', prs: [], events: {}, commits: {}, checkRuns: {}, ...parts };
}

/**
 * PR #10, opened 95 minutes ago and auto-labeled `needs review`. A review-issue
 * run then applied `review in progress` `labeledMinutesAgo` minutes ago and
 * died before posting a verdict (timeout, crash), so the label stayed.
 */
export function strandedReview(labeledMinutesAgo: number): Fixture {
    return fixture({
        prs: [pr(10, ['review in progress'], 'a10')],
        events: {
            10: [
                labeled('needs review', minutesAgo(94)),
                unlabeled('needs review', minutesAgo(labeledMinutesAgo)),
                labeled('review in progress', minutesAgo(labeledMinutesAgo)),
            ],
        },
        commits: { a10: commit('a10', minutesAgo(95)) },
    });
}

/** Run a repo script (path relative to the repo root) with the fake `gh` serving `state`. */
export function runWithFakeGh(script: string, args: string[], state: Fixture): Promise<RunResult> {
    return runArgvWithFakeGh([join(repoRoot, script), ...args], state);
}

/** Run `argv` from the repo root with the fake `gh` serving `state`. */
export async function runArgvWithFakeGh(argv: string[], state: Fixture): Promise<RunResult> {
    const fakeBin = mkdtempSync(join(tmpdir(), 'review-scripts-fakebin-'));
    const fixtureFile = join(fakeBin, 'fixture.json');
    const callLog = join(fakeBin, 'calls.log');
    writeFileSync(fixtureFile, JSON.stringify(state));
    writeFileSync(callLog, '');
    copyFileSync(fakeGhPath, join(fakeBin, 'gh'));
    chmodSync(join(fakeBin, 'gh'), 0o755);

    try {
        const proc = Bun.spawn(argv, {
            cwd: repoRoot,
            stdout: 'pipe',
            stderr: 'pipe',
            env: {
                ...process.env,
                PATH: `${fakeBin}:${process.env.PATH}`,
                GH_FIXTURE: fixtureFile,
                GH_CALL_LOG: callLog,
            },
        });
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        const calls = readFileSync(callLog, 'utf8').split('\n').filter(Boolean);

        return { stdout, stderr, exitCode, calls, state: JSON.parse(readFileSync(fixtureFile, 'utf8')) };
    } finally {
        rmSync(fakeBin, { recursive: true, force: true });
    }
}
