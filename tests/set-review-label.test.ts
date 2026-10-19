import { describe, test, expect } from 'bun:test';
import { fixture, labeled, minutesAgo, pr, runWithFakeGh, type Fixture } from './fixtures/fake-gh-review';

const script = '.claude/skills/review-issue/scripts/set-review-label.sh';

function labelsOf(state: Fixture, number: number): string[] {
    return state.prs.find(p => p.number === number)!.labels.map(l => l.name).sort();
}

function labeledEvents(state: Fixture, number: number, name: string) {
    return (state.events[number] ?? []).filter(e => e.event === 'labeled' && e.label?.name === name);
}

// See tests/find-review-candidate.test.ts for why this skips on Windows.
describe.skipIf(process.platform === 'win32')('set-review-label.sh', () => {
    test('re-applies `review in progress` when the PR already has it', async () => {
        // A review the cron takes back is still labeled `review in progress`.
        // The new attempt must still leave a `labeled` event:
        // find-review-candidate.sh times stale reviews and caps take-backs by
        // those events.
        const r = await runWithFakeGh(script, ['7', 'review in progress'], fixture({
            prs: [pr(7, ['review in progress'], 'a7')],
            events: { 7: [labeled('review in progress', minutesAgo(30))] },
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['review in progress']);
        expect(labeledEvents(r.state, 7, 'review in progress')).toHaveLength(2);
    });

    test('swaps the review-state label and leaves other labels alone', async () => {
        const r = await runWithFakeGh(script, ['7', 'review in progress'], fixture({
            prs: [pr(7, ['needs review', 'bug'], 'a7')],
            events: { 7: [labeled('needs review', minutesAgo(30))] },
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['bug', 'review in progress']);
        expect(labeledEvents(r.state, 7, 'review in progress')).toHaveLength(1);
    });

    test('does not re-apply other review-state labels that are already present', async () => {
        // Re-applying `first pass reviewed` would restart final-review's soak
        // window and move the timestamp its staleness check compares new
        // commits against.
        const r = await runWithFakeGh(script, ['7', 'first pass reviewed'], fixture({
            prs: [pr(7, ['first pass reviewed'], 'a7')],
            events: { 7: [labeled('first pass reviewed', minutesAgo(30))] },
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['first pass reviewed']);
        expect(labeledEvents(r.state, 7, 'first pass reviewed')).toHaveLength(1);
    });
});
