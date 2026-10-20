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
    test('with --reapply, re-applies a label the PR already has', async () => {
        // claim-review-candidate.sh claims a taken-back review this way: the
        // PR is still labeled `review in progress`, but the attempt must leave
        // a `labeled` event, which find-review-candidate.sh caps take-backs by.
        const r = await runWithFakeGh(script, ['--reapply', '7', 'review in progress'], fixture({
            prs: [pr(7, ['review in progress'], 'a7')],
            events: { 7: [labeled('review in progress', minutesAgo(30))] },
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['review in progress']);
        expect(labeledEvents(r.state, 7, 'review in progress')).toHaveLength(2);
    });

    test('retries a label POST that fails once', async () => {
        // --reapply has to delete the label before re-adding it, so a failed
        // POST would leave the PR with no review-state label at all.
        const r = await runWithFakeGh(script, ['--reapply', '7', 'review in progress'], fixture({
            prs: [pr(7, ['review in progress'], 'a7')],
            events: { 7: [labeled('review in progress', minutesAgo(30))] },
            failLabelPosts: 1,
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['review in progress']);
        expect(labeledEvents(r.state, 7, 'review in progress')).toHaveLength(2);
    });

    test('keeps the old review-state label when the new one can\'t be added', async () => {
        // The new label goes on before the old one comes off, so a failure
        // never leaves the PR with no review-state label.
        const r = await runWithFakeGh(script, ['7', 'review in progress'], fixture({
            prs: [pr(7, ['needs review'], 'a7')],
            events: { 7: [labeled('needs review', minutesAgo(30))] },
            failLabelPosts: 2,
        }));

        expect(r.exitCode).not.toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['needs review']);
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

    test('without --reapply, leaves a label the PR already has alone', async () => {
        // The review agent's own step-1.5 call, after the cron already claimed
        // the PR: a second `labeled` event would count as a second attempt.
        const r = await runWithFakeGh(script, ['7', 'review in progress'], fixture({
            prs: [pr(7, ['review in progress'], 'a7')],
            events: { 7: [labeled('review in progress', minutesAgo(1))] },
        }));

        expect(r.exitCode).toBe(0);
        expect(labelsOf(r.state, 7)).toEqual(['review in progress']);
        expect(labeledEvents(r.state, 7, 'review in progress')).toHaveLength(1);
    });
});
