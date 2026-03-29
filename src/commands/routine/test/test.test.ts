import { describe, test, expect, mock } from 'bun:test';
import { routineTestAction } from './test';

describe('routineTestAction', () => {
    test('executes spec and returns result', async () => {
        const result = await routineTestAction({
            loadSpec: () => ({ name: 'test-spec', description: 'A test', steps: [] }),
            validateRoutine: () => [],
            executeRoutine: mock(() => Promise.resolve({ success: true, stepsRun: 3, stepsSkipped: 0, stepsFailed: 0 })),
            dispatch: mock(() => Promise.resolve({})),
            overrides: {},
        });
        expect(result.success).toBe(true);
        expect(result.stepsRun).toBe(3);
    });

    test('throws when no spec found', () => {
        expect(routineTestAction({
            loadSpec: () => null,
            validateRoutine: () => [],
            executeRoutine: mock(() => Promise.resolve({ success: true, stepsRun: 0, stepsSkipped: 0, stepsFailed: 0 })),
            dispatch: mock(() => Promise.resolve({})),
            overrides: {},
        })).rejects.toThrow('No spec.yaml found');
    });
});
