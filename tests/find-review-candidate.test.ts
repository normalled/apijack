import { describe, test, expect } from 'bun:test';
import {
    checkRun, commit, fixture, labeled, minutesAgo, otherEvents, pr, runWithFakeGh, unlabeled,
    type CheckRun, type Fixture,
} from './fixtures/fake-gh-review';

const findScript = '.claude/skills/review-issue/scripts/find-review-candidate.sh';
const setLabelScript = '.claude/skills/review-issue/scripts/set-review-label.sh';

function find(state: Fixture, args: string[] = []) {
    return runWithFakeGh(findScript, args, state);
}

/**
 * PR #10, opened 95 minutes ago and auto-labeled `needs review`. A review-issue
 * run then applied `review in progress` `labeledMinutesAgo` minutes ago and
 * died before posting a verdict (timeout, crash), so the label stayed.
 */
function strandedReview(labeledMinutesAgo: number): Fixture {
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

// bun test runs on windows-latest in CI, where Bun can't exec a .sh directly
// (ENOENT). This script only ever runs from the claude-cron host — see the
// identical rationale in tests/extract-closing-refs.test.ts.
describe.skipIf(process.platform === 'win32')('find-review-candidate.sh', () => {
    describe('existing eligibility rules', () => {
        test('selects a `needs review` PR that has no check runs at all', async () => {
            const r = await find(fixture({ prs: [pr(10, ['needs review'], 'a10')] }));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
        });

        test('selects the lowest-numbered eligible PR', async () => {
            const r = await find(fixture({
                prs: [pr(12, ['needs review'], 'a12'), pr(11, ['needs review'], 'a11')],
            }));

            expect(r.stdout).toBe('11\n');
        });

        test('selects `changes requested` once a commit lands after the label', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['changes requested'], 'a10')],
                events: {
                    10: [
                        labeled('review in progress', minutesAgo(55)),
                        unlabeled('review in progress', minutesAgo(50)),
                        labeled('changes requested', minutesAgo(50)),
                    ],
                },
                commits: { a10: commit('a10', minutesAgo(10)) },
            }));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
        });

        test('skips `changes requested` when no commit landed after the label', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['changes requested'], 'a10')],
                events: { 10: [labeled('changes requested', minutesAgo(50))] },
                commits: { a10: commit('a10', minutesAgo(70)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('never selects `first pass reviewed` or `approved`', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['first pass reviewed'], 'a10'), pr(11, ['approved'], 'a11')],
                events: {
                    10: [labeled('first pass reviewed', minutesAgo(60))],
                    11: [labeled('approved', minutesAgo(60))],
                },
                commits: { a10: commit('a10', minutesAgo(90)), a11: commit('a11', minutesAgo(90)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });
    });

    describe('stale `review in progress`', () => {
        test('takes back a label older than the default 30-minute threshold', async () => {
            const r = await find(strandedReview(35));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
            expect(r.stderr).toContain('PR #10: taking back');
        });

        test('leaves a label younger than the threshold alone', async () => {
            // 26 minutes is just past the job's 25-minute timeout: the run may
            // only now have been killed, and the threshold keeps 5 minutes of
            // slack on top of the timeout.
            const r = await find(strandedReview(26));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('honors a stale-after argument', async () => {
            const r = await find(strandedReview(35), ['3600']);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('rejects a stale-after argument that is not a number of seconds', async () => {
            const r = await find(strandedReview(35), ['15m']);

            expect(r.exitCode).toBe(2);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('usage');
        });

        test('does not take back a second time on the same head commit', async () => {
            const state = strandedReview(75);
            // The take-back run re-applied the label (see set-review-label.sh)
            // and died too.
            state.events[10].push(
                unlabeled('review in progress', minutesAgo(40)),
                labeled('review in progress', minutesAgo(40)),
            );

            const r = await find(state);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('PR #10: \'review in progress\' stalled again');
        });

        test('times staleness from the latest attempt, not the first', async () => {
            const state = strandedReview(60);
            // A reset, then a review that started 3 minutes ago and is still running.
            state.events[10].push(
                unlabeled('review in progress', minutesAgo(20)),
                labeled('needs review', minutesAgo(20)),
                unlabeled('needs review', minutesAgo(3)),
                labeled('review in progress', minutesAgo(3)),
            );

            const r = await find(state);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('takes back again once a new commit lands', async () => {
            const state = strandedReview(60);
            state.events[10].push(
                unlabeled('review in progress', minutesAgo(40)),
                labeled('review in progress', minutesAgo(40)),
            );
            // The author pushed while the label was stuck.
            state.prs[0].headRefOid = 'b10';
            state.commits.b10 = commit('b10', minutesAgo(30));

            const r = await find(state);

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
        });

        test('takes back again after a reset to `needs review`', async () => {
            const state = strandedReview(80);
            state.events[10].push(
                unlabeled('review in progress', minutesAgo(60)),
                labeled('review in progress', minutesAgo(60)),
                // A human reset the label; the next run picked it up and died.
                unlabeled('review in progress', minutesAgo(50)),
                labeled('needs review', minutesAgo(50)),
                unlabeled('needs review', minutesAgo(45)),
                labeled('review in progress', minutesAgo(45)),
            );

            const r = await find(state);

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
        });
    });

    describe('pending checks', () => {
        test.each(['queued', 'in_progress'] as const)('defers a PR whose head has a %s check run', async (status) => {
            const r = await find(fixture({
                prs: [pr(10, ['needs review'], 'a10')],
                checkRuns: {
                    a10: [checkRun('lint', 'a10', 'completed', 'success'), checkRun('unit-tests', 'a10', status)],
                },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('PR #10: deferred');
        });

        test('moves on to the next eligible PR while one is deferred', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['needs review'], 'a10'), pr(11, ['needs review'], 'a11')],
                checkRuns: {
                    a10: [checkRun('unit-tests', 'a10', 'in_progress')],
                    a11: [checkRun('unit-tests', 'a11', 'completed', 'success')],
                },
            }));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('11\n');
        });

        test('fails rather than select a PR whose checks can\'t be read', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['needs review'], 'a10')],
                checkRuns: { a10: [checkRun('unit-tests', 'a10', 'in_progress')] },
                failingCheckRuns: ['a10'],
            }));

            expect(r.exitCode).not.toBe(0);
            expect(r.stdout).toBe('');
        });

        test('does not defer on completed checks that failed', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['needs review'], 'a10')],
                checkRuns: {
                    a10: [checkRun('lint', 'a10', 'completed', 'success'), checkRun('unit-tests', 'a10', 'completed', 'failure')],
                },
            }));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('10\n');
        });

        const pending: CheckRun[] = [checkRun('unit-tests', 'a10', 'in_progress')];

        test.each([
            ['`changes requested` with a newer commit', fixture({
                prs: [pr(10, ['changes requested'], 'a10')],
                events: { 10: [labeled('changes requested', minutesAgo(50))] },
                commits: { a10: commit('a10', minutesAgo(10)) },
                checkRuns: { a10: pending },
            })],
            ['stale `review in progress`', { ...strandedReview(35), checkRuns: { a10: pending } }],
        ])('defers a %s PR too', async (_label, state) => {
            const r = await find(state);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('PR #10: deferred');
        });
    });

    describe('label events past the events API\'s first page', () => {
        // The events API returns events oldest first, 30 a page by default
        // (100 at most). A PR with a long history has its recent label events
        // on later pages; 105 unrelated events push them past even a
        // 100-event first page.
        const longHistory = () => otherEvents(105, minutesAgo(280));

        test('times staleness from an attempt on a later page', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['review in progress'], 'a10')],
                events: {
                    10: [
                        labeled('needs review', minutesAgo(300)),
                        unlabeled('needs review', minutesAgo(290)),
                        labeled('review in progress', minutesAgo(290)),
                        ...longHistory(),
                        // A reset, then a review that's still running.
                        unlabeled('review in progress', minutesAgo(20)),
                        labeled('needs review', minutesAgo(20)),
                        unlabeled('needs review', minutesAgo(3)),
                        labeled('review in progress', minutesAgo(3)),
                    ],
                },
                commits: { a10: commit('a10', minutesAgo(310)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toBe('');
        });

        test('counts a take-back on a later page toward the cap', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['review in progress'], 'a10')],
                events: {
                    10: [
                        labeled('needs review', minutesAgo(300)),
                        unlabeled('needs review', minutesAgo(290)),
                        labeled('review in progress', minutesAgo(290)),
                        ...longHistory(),
                        unlabeled('review in progress', minutesAgo(40)),
                        labeled('review in progress', minutesAgo(40)),
                    ],
                },
                commits: { a10: commit('a10', minutesAgo(310)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('PR #10: \'review in progress\' stalled again');
        });

        test('reads a `changes requested` label on a later page', async () => {
            const r = await find(fixture({
                prs: [pr(10, ['changes requested'], 'a10')],
                events: {
                    10: [
                        labeled('changes requested', minutesAgo(300)),
                        ...longHistory(),
                        labeled('review in progress', minutesAgo(50)),
                        unlabeled('review in progress', minutesAgo(45)),
                        labeled('changes requested', minutesAgo(45)),
                    ],
                },
                // Pushed before the latest `changes requested`: not a response to it.
                commits: { a10: commit('a10', minutesAgo(60)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toBe('');
        });
    });

    describe('take-back cap, end to end with set-review-label.sh', () => {
        test('a taken-back review that dies again is not taken back a second time', async () => {
            const first = await find(strandedReview(35));
            expect(first.stdout).toBe('10\n');

            // The take-back run's first step (review-issue SKILL.md step 1.5).
            const relabel = await runWithFakeGh(setLabelScript, ['10', 'review in progress'], first.state);
            expect(relabel.exitCode).toBe(0);

            // That run dies too. With stale-after 0 its label is already stale,
            // so only the cap can keep the PR out.
            const second = await find(relabel.state, ['0']);

            expect(second.exitCode).toBe(1);
            expect(second.stdout).toBe('');
            expect(second.stderr).toContain('PR #10: \'review in progress\' stalled again');
        });
    });
});
