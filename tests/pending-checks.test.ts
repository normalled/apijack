import { describe, test, expect } from 'bun:test';
import { checkRun, fixture, pr, runWithFakeGh, type Fixture } from './fixtures/fake-gh-review';

const script = '.claude/skills/review-issue/scripts/pending-checks.sh';

function pendingChecks(state: Fixture, args: string[] = ['10']) {
    return runWithFakeGh(script, args, state);
}

// See tests/find-review-candidate.test.ts for why this skips on Windows.
describe.skipIf(process.platform === 'win32')('pending-checks.sh', () => {
    test('counts the check runs that have not completed', async () => {
        const r = await pendingChecks(fixture({
            prs: [pr(10, ['needs review'], 'a10')],
            checkRuns: {
                a10: [
                    checkRun('lint', 'a10', 'completed', 'success'),
                    checkRun('unit-tests (ubuntu-latest)', 'a10', 'in_progress'),
                    checkRun('Petstore (OAS 3.0)', 'a10', 'queued'),
                ],
            },
        }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('2\n');
    });

    test('counts completed check runs as not pending, whatever their conclusion', async () => {
        const r = await pendingChecks(fixture({
            prs: [pr(10, ['needs review'], 'a10')],
            checkRuns: {
                a10: [
                    checkRun('lint', 'a10', 'completed', 'success'),
                    checkRun('unit-tests', 'a10', 'completed', 'failure'),
                    checkRun('e2e', 'a10', 'completed', 'skipped'),
                    checkRun('shellcheck', 'a10', 'completed', 'cancelled'),
                ],
            },
        }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('0\n');
    });

    test('prints 0 when the head commit has no check runs at all', async () => {
        // Path-filtered workflows don't run for some changes (e.g. a
        // SKILL.md-only push), so a head can legitimately have zero checks.
        const r = await pendingChecks(fixture({ prs: [pr(10, ['needs review'], 'a10')] }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('0\n');
    });

    test('checks the PR\'s current head commit', async () => {
        const r = await pendingChecks(fixture({
            prs: [pr(10, ['needs review'], 'b10')],
            checkRuns: {
                a10: [checkRun('unit-tests', 'a10', 'in_progress')],
                b10: [checkRun('unit-tests', 'b10', 'completed', 'success')],
            },
        }));

        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe('0\n');
    });

    test('fails without printing a count when the check runs can\'t be read', async () => {
        // Printing 0 here would read as "nothing pending" and let a review
        // start, or decide, while CI is still running.
        const r = await pendingChecks(fixture({
            prs: [pr(10, ['needs review'], 'a10')],
            checkRuns: { a10: [checkRun('unit-tests', 'a10', 'in_progress')] },
            failingCheckRuns: ['a10'],
        }));

        expect(r.exitCode).not.toBe(0);
        expect(r.stdout).toBe('');
    });

    test('requires a PR number', async () => {
        const r = await pendingChecks(fixture({}), []);

        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('usage');
    });
});
