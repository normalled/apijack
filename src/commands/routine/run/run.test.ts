import { describe, test, expect, mock } from 'bun:test';
import { routineRunAction } from './run';

describe('routineRunAction', () => {
    test('executes routine and returns result', async () => {
        const result = await routineRunAction({
            loadRoutine: () => ({ name: 'test-routine', description: 'A test', steps: [] }),
            validateRoutine: () => [],
            executeRoutine: mock(() => Promise.resolve({ status: 'ok' as const, success: true, output: {}, steps: [], durationMs: 0, stepsRun: 2, stepsSkipped: 0, stepsFailed: 0 })),
            dispatch: mock(() => Promise.resolve({})),
            overrides: {},
            invalidateSession: mock(() => {}),
        });
        expect(result.success).toBe(true);
        expect(result.stepsRun).toBe(2);
    });

    test('throws on validation errors', () => {
        expect(routineRunAction({
            loadRoutine: () => ({ name: 'bad', steps: [] }),
            validateRoutine: () => ['missing steps'],
            executeRoutine: mock(() => Promise.resolve({ status: 'ok' as const, success: true, output: {}, steps: [], durationMs: 0, stepsRun: 0, stepsSkipped: 0, stepsFailed: 0 })),
            dispatch: mock(() => Promise.resolve({})),
            overrides: {},
            invalidateSession: mock(() => {}),
        })).rejects.toThrow('Validation errors');
    });

    test('passes silent: true through to executor when caller sets it', async () => {
        let capturedOpts: any = null;
        const result = await routineRunAction({
            loadRoutine: () => ({ name: 'r', steps: [{ name: 's', command: 'c' }] }),
            validateRoutine: () => [],
            executeRoutine: async (def, overrides, dispatch, opts) => {
                capturedOpts = opts;

                return {
                    status: 'ok',
                    success: true,
                    output: {},
                    steps: [],
                    durationMs: 0,
                    stepsRun: 1,
                    stepsSkipped: 0,
                    stepsFailed: 0,
                };
            },
            dispatch: async () => ({}),
            overrides: {},
            silent: true,
            invalidateSession: () => {},
        });
        expect(capturedOpts.silent).toBe(true);
        expect(result.success).toBe(true);
    });
});
