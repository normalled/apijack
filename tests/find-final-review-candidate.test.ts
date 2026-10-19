import { describe, test, expect } from 'bun:test';
import {
    checkRun, commit, fixture, labeled, minutesAgo, otherEvents, pr, runWithFakeGh, unlabeled,
    type Fixture, type IssueEvent,
} from './fixtures/fake-gh-review';

const script = '.claude/skills/final-review/scripts/find-final-review-candidate.sh';

function findFinal(state: Fixture, args: string[] = []) {
    return runWithFakeGh(script, args, state);
}

/** The label history of a PR that passed first-pass review `labeledMinutesAgo` minutes ago. */
function reviewHistory(labeledMinutesAgo: number): IssueEvent[] {
    return [
        labeled('needs review', minutesAgo(90)),
        unlabeled('needs review', minutesAgo(labeledMinutesAgo + 5)),
        labeled('review in progress', minutesAgo(labeledMinutesAgo + 5)),
        unlabeled('review in progress', minutesAgo(labeledMinutesAgo)),
        labeled('first pass reviewed', minutesAgo(labeledMinutesAgo)),
    ];
}

/** PR #20: head committed `committedMinutesAgo` ago, labeled `first pass reviewed` `labeledMinutesAgo` ago. */
function reviewed(labeledMinutesAgo: number, committedMinutesAgo: number): Fixture {
    return fixture({
        prs: [pr(20, ['first pass reviewed'], 'c20')],
        events: { 20: reviewHistory(labeledMinutesAgo) },
        commits: { c20: commit('c20', minutesAgo(committedMinutesAgo)) },
    });
}

// See tests/find-review-candidate.test.ts for why this skips on Windows.
describe.skipIf(process.platform === 'win32')('find-final-review-candidate.sh', () => {
    describe('existing rules', () => {
        test('selects a PR whose label has soaked with no commit since (and no check runs at all)', async () => {
            const r = await findFinal(reviewed(10, 30));

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('20\n');
        });

        test('skips a label younger than the soak window', async () => {
            const r = await findFinal(reviewed(2, 30));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('honors a min-age argument', async () => {
            const r = await findFinal(reviewed(10, 30), ['900']);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('skips a PR with a commit after the label', async () => {
            const r = await findFinal(reviewed(10, 5));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('selects a PR whose head was committed in the same second as the label', async () => {
            // The review cron treats only a strictly newer commit as stale, so
            // every `first pass reviewed` PR belongs to exactly one cron.
            const state = reviewed(10, 30);
            state.commits.c20 = commit('c20', state.events[20].at(-1)!.created_at);

            const r = await findFinal(state);

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('20\n');
        });

        test('skips draft PRs', async () => {
            // GitHub refuses to merge a draft (405); selecting one would
            // bounce it through a merge failure and a full re-review.
            const state = reviewed(10, 30);
            state.prs[0].isDraft = true;

            const r = await findFinal(state);

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });

        test('only considers PRs labeled `first pass reviewed`', async () => {
            const r = await findFinal(fixture({
                prs: [pr(20, ['needs review'], 'c20'), pr(21, ['approved'], 'c21')],
                events: { 20: [labeled('needs review', minutesAgo(30))], 21: reviewHistory(30) },
                commits: { c20: commit('c20', minutesAgo(40)), c21: commit('c21', minutesAgo(40)) },
            }));

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
        });
    });

    describe('pending checks', () => {
        test.each(['queued', 'in_progress'] as const)('defers a PR whose head has a %s check run', async (status) => {
            const r = await findFinal({
                ...reviewed(10, 30),
                checkRuns: { c20: [checkRun('lint', 'c20', 'completed', 'success'), checkRun('unit-tests', 'c20', status)] },
            });

            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain('PR #20: deferred');
        });

        test('moves on to a later eligible PR while one is deferred', async () => {
            const state = reviewed(10, 30);
            state.prs.push(pr(21, ['first pass reviewed'], 'c21'));
            state.events[21] = reviewHistory(12);
            state.commits.c21 = commit('c21', minutesAgo(30));
            state.checkRuns = {
                c20: [checkRun('unit-tests', 'c20', 'in_progress')],
                c21: [checkRun('unit-tests', 'c21', 'completed', 'success')],
            };

            const r = await findFinal(state);

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('21\n');
        });

        test('does not defer on completed checks that failed', async () => {
            // final-review's gate turns red CI into one comment and
            // `changes requested`; deferring it would hide the failure.
            const r = await findFinal({
                ...reviewed(10, 30),
                checkRuns: { c20: [checkRun('unit-tests', 'c20', 'completed', 'failure')] },
            });

            expect(r.exitCode).toBe(0);
            expect(r.stdout).toBe('20\n');
        });

        test('fails rather than select a PR whose checks can\'t be read', async () => {
            const r = await findFinal({
                ...reviewed(10, 30),
                checkRuns: { c20: [checkRun('unit-tests', 'c20', 'in_progress')] },
                failingCheckRuns: ['c20'],
            });

            expect(r.exitCode).not.toBe(0);
            expect(r.stdout).toBe('');
        });
    });

    test('reads the latest label past the events API\'s first page', async () => {
        // An old first-pass label on page 1, then a long history, then the
        // re-review that followed the latest commit.
        const r = await findFinal(fixture({
            prs: [pr(20, ['first pass reviewed'], 'c20')],
            events: {
                20: [
                    labeled('first pass reviewed', minutesAgo(300)),
                    ...otherEvents(105, minutesAgo(280)),
                    ...reviewHistory(20).slice(1),
                ],
            },
            commits: { c20: commit('c20', minutesAgo(40)) },
        }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('20\n');
    });
});
