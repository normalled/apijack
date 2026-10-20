import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import {
    commit, fixture, labeled, minutesAgo, pr, repoRoot, runArgvWithFakeGh, runWithFakeGh, strandedReview,
    type Fixture,
} from './fixtures/fake-gh-review';

const claimScript = '.claude/skills/review-issue/scripts/claim-review-candidate.sh';
const findScript = '.claude/skills/review-issue/scripts/find-review-candidate.sh';
const setLabelScript = '.claude/skills/review-issue/scripts/set-review-label.sh';

function labeledEvents(state: Fixture, number: number, name: string) {
    return (state.events[number] ?? []).filter(e => e.event === 'labeled' && e.label?.name === name);
}

/** The review agent's step 1.5 (review-issue SKILL.md), which may or may not run. */
function agentStep15(state: Fixture) {
    return runWithFakeGh(setLabelScript, ['10', 'review in progress'], state);
}

// See tests/find-review-candidate.test.ts for why this skips on Windows.
describe.skipIf(process.platform === 'win32')('claim-review-candidate.sh', () => {
    test('leaves a first pick\'s label to the review agent', async () => {
        // If claude fails fast (usage limit, expired auth), the PR stays
        // `needs review` and is picked again once claude is back, instead of
        // being claimed, taken back and capped.
        const r = await runWithFakeGh(claimScript, ['1800'], fixture({ prs: [pr(10, ['needs review'], 'a10')] }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('10\n');
        expect(r.state.prs[0].labels.map(l => l.name)).toEqual(['needs review']);
        expect(labeledEvents(r.state, 10, 'review in progress')).toHaveLength(0);
    });

    test('claims nothing when no PR is eligible', async () => {
        const state = fixture({
            prs: [pr(10, ['first pass reviewed'], 'a10')],
            events: { 10: [labeled('first pass reviewed', minutesAgo(20))] },
            commits: { a10: commit('a10', minutesAgo(30)) },
        });

        const r = await runWithFakeGh(claimScript, ['1800'], state);

        expect(r.exitCode).not.toBe(0);
        expect(r.stdout).toBe('');
        expect(r.state.prs[0].labels.map(l => l.name)).toEqual(['first pass reviewed']);
        expect(r.state.events[10]).toHaveLength(1);
    });

    test('records a fresh `labeled` event when it takes back a stranded review', async () => {
        const r = await runWithFakeGh(claimScript, ['1800'], strandedReview(35));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('10\n');
        expect(labeledEvents(r.state, 10, 'review in progress')).toHaveLength(2);
    });

    describe('the review-issue job\'s prompt_cmd, run the way claude-cron runs it', () => {
        // `bash -c` from the repo root. Its whole stdout becomes the agent's
        // prompt, and a non-zero exit means the run doesn't start.
        const job = yaml.load(readFileSync(join(repoRoot, '.claude-jobs/review-issue.yaml'), 'utf8')) as {
            claude: { prompt_cmd: string };
        };
        const promptCmd = (state: Fixture) => runArgvWithFakeGh(['bash', '-c', job.claude.prompt_cmd], state);

        test('claims a take-back and prompts with only the PR number', async () => {
            const r = await promptCmd(strandedReview(35));

            expect(r.exitCode).toBe(0);
            expect(r.stdout.trim()).toBe('/review-issue 10');
            expect(labeledEvents(r.state, 10, 'review in progress')).toHaveLength(2);
        });

        test('fails, without a prompt, when no PR is eligible', async () => {
            const r = await promptCmd(fixture({
                prs: [pr(10, ['first pass reviewed'], 'a10')],
                events: { 10: [labeled('first pass reviewed', minutesAgo(20))] },
                commits: { a10: commit('a10', minutesAgo(30)) },
            }));

            expect(r.exitCode).not.toBe(0);
            expect(r.stdout).not.toContain('/review-issue');
            expect(r.state.events[10]).toHaveLength(1);
        });
    });

    describe('one take-back per head commit, whatever the review agent does', () => {
        test.each([
            ['runs step 1.5', true],
            ['skips step 1.5', false],
        ])('a take-back run whose agent %s and then dies is not taken back again', async (_label, runsStep15) => {
            const claimed = await runWithFakeGh(claimScript, ['1800'], strandedReview(35));
            expect(claimed.stdout).toBe('10\n');

            let state = claimed.state;

            if (runsStep15) {
                state = (await agentStep15(state)).state;
            }

            // The run dies. With stale-after 0 its label is already stale, so
            // only the cap can keep the PR out.
            const next = await runWithFakeGh(findScript, ['0'], state);

            expect(next.exitCode).toBe(1);
            expect(next.stdout).toBe('');
            expect(next.stderr).toContain('PR #10: \'review in progress\' stalled again');
        });

        test('a first run whose agent never starts leaves the PR eligible as it was', async () => {
            const claimed = await runWithFakeGh(claimScript, ['1800'], fixture({ prs: [pr(10, ['needs review'], 'a10')] }));

            const next = await runWithFakeGh(findScript, ['1800'], claimed.state);

            expect(next.exitCode).toBe(0);
            expect(next.stdout).toBe('10\n');
            expect(next.stderr).not.toContain('taking back');
        });

        test('a first run that dies still gets its take-back', async () => {
            // The claim and the agent's own step-1.5 call must not count as two
            // attempts.
            const claimed = await runWithFakeGh(claimScript, ['1800'], fixture({
                prs: [pr(10, ['needs review'], 'a10')],
                events: { 10: [labeled('needs review', minutesAgo(30))] },
                commits: { a10: commit('a10', minutesAgo(31)) },
            }));
            const afterAgent = await agentStep15(claimed.state);

            const next = await runWithFakeGh(findScript, ['0'], afterAgent.state);

            expect(next.exitCode).toBe(0);
            expect(next.stdout).toBe('10\n');
            expect(next.stderr).toContain('PR #10: taking back');
        });
    });
});
