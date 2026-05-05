import { describe, expect, test, mock } from 'bun:test';
import { executeRoutine } from '../../src/routine/executor';
import { PluginRegistry } from '../../src/plugin/registry';
import type { RoutineDefinition, RoutineStep } from '../../src/routine/types';
import type { CommandDispatcher } from '../../src/types';

function makeRoutine(overrides: Partial<RoutineDefinition> = {}): RoutineDefinition {
    return {
        name: 'test-routine',
        steps: [],
        variables: {},
        ...overrides,
    };
}

function makeMockDispatcher(results: Record<string, unknown> = {}) {
    const calls: { command: string; args: Record<string, unknown>; positionalArgs?: unknown[] }[] = [];
    const dispatcher: CommandDispatcher = async (command, args, positionalArgs) => {
        calls.push({ command, args, positionalArgs });

        if (command in results) return results[command];

        return { ok: true };
    };

    return { dispatcher, calls };
}

describe('executeRoutine', () => {
    test('runs steps sequentially, calls dispatcher for each', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'step-1', command: 'cmd-a', args: { key: 'val1' } },
                { name: 'step-2', command: 'cmd-b', args: { key: 'val2' } },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(result.stepsRun).toBe(2);
        expect(result.stepsSkipped).toBe(0);
        expect(result.stepsFailed).toBe(0);
        expect(calls.length).toBe(2);
        expect(calls[0]!.command).toBe('cmd-a');
        expect(calls[1]!.command).toBe('cmd-b');
    });

    test('skips steps where condition is false', async () => {
        const routine = makeRoutine({
            variables: { enabled: false },
            steps: [
                { name: 'skipped', command: 'cmd-a', condition: '$enabled' },
                { name: 'run', command: 'cmd-b' },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(result.stepsRun).toBe(1);
        expect(result.stepsSkipped).toBe(1);
        expect(calls.length).toBe(1);
        expect(calls[0]!.command).toBe('cmd-b');
    });

    test('forEach iterates over array', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b', 'c'] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', args: { value: '$item' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(calls.length).toBe(3);
        expect(calls[0]!.args.value).toBe('a');
        expect(calls[1]!.args.value).toBe('b');
        expect(calls[2]!.args.value).toBe('c');
    });

    test('assertions pass correctly', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'check',
                    command: 'cmd-a',
                    assert: '$check.success == true',
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher({ 'cmd-a': { status: 'ok' } });
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(result.stepsFailed).toBe(0);
    });

    test('assertions fail correctly', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'check',
                    command: 'cmd-a',
                    assert: '$check.success == false',
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher({ 'cmd-a': { status: 'ok' } });
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(false);
        expect(result.stepsFailed).toBe(1);
    });

    test('continueOnError allows continued execution', async () => {
        const failDispatcher: CommandDispatcher = async (command) => {
            if (command === 'fail-cmd') throw new Error('boom');

            return { ok: true };
        };

        const routine = makeRoutine({
            steps: [
                { name: 'will-fail', command: 'fail-cmd', continueOnError: true },
                { name: 'will-run', command: 'ok-cmd' },
            ],
        });
        const result = await executeRoutine(routine, {}, failDispatcher);

        expect(result.success).toBe(false); // stepsFailed > 0
        expect(result.stepsRun).toBe(2);
        expect(result.stepsFailed).toBe(1);
    });

    test('dry run prints without executing', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'step-1', command: 'cmd-a', args: { key: 'val' } },
                { name: 'step-2', command: 'cmd-b' },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher, { dryRun: true });

        expect(result.stepsRun).toBe(2);
        expect(calls.length).toBe(0); // dispatcher never called
    });

    test('step outputs accessible via $stepName', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'create', command: 'create-thing' },
                { name: 'use', command: 'use-thing', args: { id: '$create.id' } },
            ],
        });
        const callIndex = { i: 0 };
        const dispatcher: CommandDispatcher = async (command) => {
            callIndex.i++;

            if (command === 'create-thing') return { id: 42 };

            return { ok: true };
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(result.stepsRun).toBe(2);
    });

    test('step outputs accessible via output alias', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'create', command: 'create-thing', output: 'created' },
                { name: 'use', command: 'use-thing', args: { id: '$created.id' } },
            ],
        });
        const dispatched: Record<string, unknown>[] = [];
        const dispatcher: CommandDispatcher = async (command, args) => {
            dispatched.push(args);

            if (command === 'create-thing') return { id: 99 };

            return { ok: true };
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        expect(dispatched[1]!.id).toBe(99);
    });

    test('variable overrides merge with defaults', async () => {
        const routine = makeRoutine({
            variables: { greeting: 'hello', target: 'world' },
            steps: [
                { name: 'greet', command: 'say', args: { msg: '$greeting $target' } },
            ],
        });
        const dispatched: Record<string, unknown>[] = [];
        const dispatcher: CommandDispatcher = async (_cmd, args) => {
            dispatched.push(args);

            return {};
        };
        const result = await executeRoutine(routine, { target: 'universe' }, dispatcher);

        expect(result.success).toBe(true);
        expect(dispatched[0]!.msg).toBe('hello universe');
    });

    test('built-in $_timestamp and $_date available', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'check', command: 'cmd', args: { ts: '$_timestamp', dt: '$_date' } },
            ],
        });
        const dispatched: Record<string, unknown>[] = [];
        const dispatcher: CommandDispatcher = async (_cmd, args) => {
            dispatched.push(args);

            return {};
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.success).toBe(true);
        const ts = dispatched[0]!.ts as number;
        const dt = dispatched[0]!.dt as string;
        // Timestamp should be a reasonable Unix epoch (seconds)
        expect(typeof ts).toBe('number');
        expect(ts).toBeGreaterThan(1700000000);
        // Date should be ISO format YYYY-MM-DD
        expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('onStep callback is called for each step', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'a', command: 'cmd-a' },
                { name: 'b', command: 'cmd-b' },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const stepCalls: { name: string; index: number; total: number }[] = [];
        const result = await executeRoutine(routine, {}, dispatcher, {
            onStep: (step, index, total) => {
                stepCalls.push({ name: step.name, index, total });
            },
        });

        expect(result.success).toBe(true);
        expect(stepCalls.length).toBe(2);
        expect(stepCalls[0]).toEqual({ name: 'a', index: 0, total: 2 });
        expect(stepCalls[1]).toEqual({ name: 'b', index: 1, total: 2 });
    });

    test('error without continueOnError stops execution', async () => {
        const failDispatcher: CommandDispatcher = async (command) => {
            if (command === 'fail-cmd') throw new Error('boom');

            return { ok: true };
        };

        const routine = makeRoutine({
            steps: [
                { name: 'will-fail', command: 'fail-cmd' },
                { name: 'wont-run', command: 'ok-cmd' },
            ],
        });
        const result = await executeRoutine(routine, {}, failDispatcher);

        expect(result.success).toBe(false);
        expect(result.stepsRun).toBe(1);
        expect(result.stepsFailed).toBe(1);
    });

    test('forEach with reverse iterates in reverse order', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b', 'c', 'd'] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    reverse: true,
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', args: { value: '$item' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(4);
        expect(calls[0]!.args.value).toBe('d');
        expect(calls[1]!.args.value).toBe('c');
        expect(calls[2]!.args.value).toBe('b');
        expect(calls[3]!.args.value).toBe('a');
    });

    test('forEach with shuffle produces all items (just reordered)', async () => {
        const items = Array.from({ length: 20 }, (_, i) => i);
        const routine = makeRoutine({
            variables: { items },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    shuffle: true,
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', args: { value: '$item' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(20);
        const values = calls.map(c => c.args.value as number).sort((a, b) => a - b);
        expect(values).toEqual(items);
    });

    test('range with reverse iterates high to low', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'loop',
                    range: [1, 5] as [number, number],
                    reverse: true,
                    as: 'n',
                    steps: [
                        { name: 'inner', command: 'process', args: { num: '$n' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(5);
        expect(calls[0]!.args.num).toBe(5);
        expect(calls[1]!.args.num).toBe(4);
        expect(calls[2]!.args.num).toBe(3);
        expect(calls[3]!.args.num).toBe(2);
        expect(calls[4]!.args.num).toBe(1);
    });

    test('range with shuffle produces all numbers (just reordered)', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'loop',
                    range: [1, 10] as [number, number],
                    shuffle: true,
                    as: 'n',
                    steps: [
                        { name: 'inner', command: 'process', args: { num: '$n' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(10);
        const nums = calls.map(c => c.args.num as number).sort((a, b) => a - b);
        expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('$_random_hex_color produces valid colors in routine steps', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'loop',
                    range: [1, 5] as [number, number],
                    steps: [
                        { name: 'inner', command: 'colorize', args: { color: '$_random_hex_color' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(5);

        for (const call of calls) {
            const color = call.args.color as string;
            expect(color).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    test('$_random_distinct_from produces no repeats within a forEach', async () => {
        const routine = makeRoutine({
            variables: { items: [1, 2, 3] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    steps: [
                        {
                            name: 'inner',
                            command: 'assign',
                            args: { value: '$_random_distinct_from(x,y,z)' },
                        },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher);

        expect(calls.length).toBe(3);
        const values = calls.map(c => c.args.value as string).sort();
        expect(values).toEqual(['x', 'y', 'z']);
    });

    test('$_timestamp resolved in default variables', async () => {
        const routine = makeRoutine({
            variables: { label: 'run-$_timestamp' },
            steps: [
                { name: 'check', command: 'cmd', args: { label: '$label' } },
            ],
        });
        const dispatched: Record<string, unknown>[] = [];
        const dispatcher: CommandDispatcher = async (_cmd, args) => {
            dispatched.push(args);

            return {};
        };
        await executeRoutine(routine, {}, dispatcher);

        const label = dispatched[0]!.label as string;
        expect(label).toMatch(/^run-\d+$/);
    });

    test('steps[] contains an entry per executed step with correct status', async () => {
        const routine = makeRoutine({
            variables: { gate: false },
            steps: [
                { name: 'a', command: 'cmd-a' },
                { name: 'b', command: 'cmd-b', condition: '$gate' },
                { name: 'c', command: 'cmd-c' },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.steps.length).toBe(3);
        expect(result.steps[0]!).toMatchObject({ name: 'a', status: 'ok' });
        expect(result.steps[1]!).toMatchObject({ name: 'b', status: 'skipped' });
        expect(result.steps[2]!).toMatchObject({ name: 'c', status: 'ok' });
    });

    test('steps[] records failed step and stops on first failure (no continueOnError)', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'first', command: 'ok' },
                { name: 'broken', command: 'boom' },
                { name: 'never', command: 'ok' },
            ],
        });
        const dispatcher: CommandDispatcher = async (command) => {
            if (command === 'boom') throw new Error('kaboom');

            return { ok: true };
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.status).toBe('failed');
        expect(result.success).toBe(false);
        expect(result.steps.length).toBe(2);
        expect(result.steps[0]!).toMatchObject({ name: 'first', status: 'ok' });
        expect(result.steps[1]!).toMatchObject({ name: 'broken', status: 'failed', error: 'kaboom' });
    });

    test('output aggregates results from steps with output: alias', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'create-user', command: 'users.create', output: 'user' },
                { name: 'create-token', command: 'tokens.create', output: 'token' },
                { name: 'no-alias', command: 'misc.ping' },
            ],
        });
        const dispatcher: CommandDispatcher = async (command) => {
            if (command === 'users.create') return { id: 'u-1', name: 'Ada' };

            if (command === 'tokens.create') return { id: 't-1', secret: 'shh' };

            return { ok: true };
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.output).toEqual({
            user: { id: 'u-1', name: 'Ada' },
            token: { id: 't-1', secret: 'shh' },
        });
        // step without output: alias is in steps[] but not in output
        expect(Object.keys(result.output).sort()).toEqual(['token', 'user']);
    });

    test('failed step does not populate output[alias]', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'ok-step', command: 'ok', output: 'first' },
                { name: 'fail-step', command: 'fail', output: 'second' },
            ],
        });
        const dispatcher: CommandDispatcher = async (command) => {
            if (command === 'fail') throw new Error('nope');

            return { ok: true };
        };
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.output).toEqual({ first: { ok: true } });
        expect(result.output).not.toHaveProperty('second');
    });

    test('assertion failure removes the alias from output', async () => {
        const routine = makeRoutine({
            variables: { expected: 'wrong' },
            steps: [
                {
                    name: 'create',
                    command: 'cmd-a',
                    output: 'created',
                    assert: '$created.name == $expected',
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher({ 'cmd-a': { name: 'actual' } });
        const result = await executeRoutine(routine, {}, dispatcher, { silent: true });

        expect(result.status).toBe('failed');
        expect(result.steps[0]!).toMatchObject({ name: 'create', status: 'failed' });
        expect(result.output).not.toHaveProperty('created');
    });

    test('silent: true suppresses stderr and console.error writes from executor', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'broken', command: 'fail' },
            ],
        });
        const dispatcher: CommandDispatcher = async () => {
            throw new Error('boom');
        };

        const captured: string[] = [];
        const origConsoleError = console.error;
        const origStderrWrite = process.stderr.write.bind(process.stderr);
        console.error = (...args: unknown[]) => {
            captured.push(args.join(' '));
        };
        process.stderr.write = ((chunk: any) => {
            captured.push(typeof chunk === 'string' ? chunk : chunk.toString());

            return true;
        }) as typeof process.stderr.write;

        try {
            const result = await executeRoutine(routine, {}, dispatcher, { silent: true });
            expect(result.status).toBe('failed');
            expect(captured.join('')).toBe('');
        } finally {
            console.error = origConsoleError;
            process.stderr.write = origStderrWrite;
        }
    });

    test('silent: false (default) writes step failure to stderr/console.error', async () => {
        const routine = makeRoutine({
            steps: [{ name: 'broken', command: 'fail' }],
        });
        const dispatcher: CommandDispatcher = async () => {
            throw new Error('boom');
        };

        const captured: string[] = [];
        const origConsoleError = console.error;
        console.error = (...args: unknown[]) => {
            captured.push(args.join(' '));
        };

        try {
            await executeRoutine(routine, {}, dispatcher);
            expect(captured.join('\n')).toContain('boom');
        } finally {
            console.error = origConsoleError;
        }
    });

    test('forEach on non-array emits a skipped steps[] entry (invariant: stepsSkipped == steps.filter(skipped))', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'loop',
                    forEach: '$not-an-array',
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', args: { value: '$item' } },
                    ],
                },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher, { silent: true });

        expect(result.success).toBe(true);
        expect(result.stepsSkipped).toBe(1);
        expect(calls.length).toBe(0);
        expect(result.steps.length).toBe(1);
        expect(result.steps[0]!).toMatchObject({ name: 'loop', status: 'skipped' });
        // Invariant from issue #100
        expect(result.stepsSkipped).toBe(
            result.steps.filter(s => s.status === 'skipped').length,
        );
    });

    test('forEach iteration entries are tagged with iteration index and total', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b', 'c'] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', args: { value: '$item' } },
                    ],
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.steps.length).toBe(3);
        expect(result.steps[0]!).toMatchObject({
            name: 'inner',
            status: 'ok',
            iteration: { index: 0, total: 3 },
        });
        expect(result.steps[1]!).toMatchObject({
            name: 'inner',
            status: 'ok',
            iteration: { index: 1, total: 3 },
        });
        expect(result.steps[2]!).toMatchObject({
            name: 'inner',
            status: 'ok',
            iteration: { index: 2, total: 3 },
        });
        // Iteration entries are distinguishable
        const iterations = result.steps.map(s => s.iteration?.index);
        expect(iterations).toEqual([0, 1, 2]);
    });

    test('range iteration entries are tagged with iteration index and total', async () => {
        const routine = makeRoutine({
            steps: [
                {
                    name: 'loop',
                    range: [1, 3] as [number, number],
                    as: 'n',
                    steps: [
                        { name: 'inner', command: 'process', args: { num: '$n' } },
                    ],
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.steps.length).toBe(3);
        expect(result.steps[0]!.iteration).toEqual({ index: 0, total: 3 });
        expect(result.steps[1]!.iteration).toEqual({ index: 1, total: 3 });
        expect(result.steps[2]!.iteration).toEqual({ index: 2, total: 3 });
    });

    test('skipped step inside forEach iteration carries the iteration tag', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b'], gate: false },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    steps: [
                        { name: 'inner', command: 'process', condition: '$gate' },
                    ],
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.stepsSkipped).toBe(2);
        expect(result.steps.length).toBe(2);
        expect(result.steps[0]!).toMatchObject({
            name: 'inner',
            status: 'skipped',
            iteration: { index: 0, total: 2 },
        });
        expect(result.steps[1]!).toMatchObject({
            name: 'inner',
            status: 'skipped',
            iteration: { index: 1, total: 2 },
        });
        // Invariant
        expect(result.stepsSkipped).toBe(
            result.steps.filter(s => s.status === 'skipped').length,
        );
    });

    test('assertion failure inside forEach iteration preserves the iteration tag', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b'] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    continueOnError: true,
                    steps: [
                        {
                            name: 'inner',
                            command: 'cmd',
                            output: 'r',
                            assert: '$r.value == "never"',
                        },
                    ],
                },
            ],
        });
        const { dispatcher } = makeMockDispatcher({ cmd: { value: 'actual' } });
        const result = await executeRoutine(routine, {}, dispatcher, { silent: true });

        expect(result.steps.length).toBe(2);
        expect(result.steps[0]!).toMatchObject({
            name: 'inner',
            status: 'failed',
            iteration: { index: 0, total: 2 },
        });
        expect(result.steps[1]!).toMatchObject({
            name: 'inner',
            status: 'failed',
            iteration: { index: 1, total: 2 },
        });
    });

    test('non-iteration steps do not carry an iteration tag', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'a', command: 'cmd-a' },
                { name: 'b', command: 'cmd-b' },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.steps[0]!.iteration).toBeUndefined();
        expect(result.steps[1]!.iteration).toBeUndefined();
    });

    test('steps after a forEach do not carry an iteration tag', async () => {
        const routine = makeRoutine({
            variables: { items: ['a', 'b'] },
            steps: [
                {
                    name: 'loop',
                    forEach: '$items',
                    as: 'item',
                    steps: [{ name: 'inner', command: 'cmd-inner' }],
                },
                { name: 'after', command: 'cmd-after' },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.steps.length).toBe(3);
        expect(result.steps[0]!.iteration).toEqual({ index: 0, total: 2 });
        expect(result.steps[1]!.iteration).toEqual({ index: 1, total: 2 });
        expect(result.steps[2]!).toMatchObject({ name: 'after', status: 'ok' });
        expect(result.steps[2]!.iteration).toBeUndefined();
    });

    test('result includes status, output, steps, and durationMs fields', async () => {
        const routine = makeRoutine({
            steps: [
                { name: 'step-1', command: 'cmd-a' },
            ],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);

        expect(result.status).toBe('ok');
        expect(result.success).toBe(true);
        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.output).toEqual({});
        expect(Array.isArray(result.steps)).toBe(true);
    });
});

describe('executeRoutine with plugin registry', () => {
    test('invokes createRoutineResolvers once per routine run', async () => {
        const reg = new PluginRegistry();
        let factoryCalls = 0;
        reg.register({
            name: 'counter',
            createRoutineResolvers: (opts) => {
                factoryCalls++;
                let n = (opts as { start?: number })?.start ?? 0;

                return { _counter: () => String(n++) };
            },
        });

        const routine = makeRoutine({
            plugins: { counter: { start: 10 } },
            steps: [
                { name: 's1', command: 'cmd', args: { out: '$_counter()' } },
                { name: 's2', command: 'cmd', args: { out: '$_counter()' } },
            ],
        });
        const { dispatcher, calls } = makeMockDispatcher();
        await executeRoutine(routine, {}, dispatcher, { pluginRegistry: reg });
        await executeRoutine(routine, {}, dispatcher, { pluginRegistry: reg });

        expect(factoryCalls).toBe(2);
        // First run: 10, 11. Second run fresh closure: 10, 11.
        expect(calls[0]!.args.out).toBe('10');
        expect(calls[1]!.args.out).toBe('11');
        expect(calls[2]!.args.out).toBe('10');
        expect(calls[3]!.args.out).toBe('11');
    });

    test('executor works without a pluginRegistry (backward compat)', async () => {
        const routine = makeRoutine({
            steps: [{ name: 's1', command: 'cmd', args: {} }],
        });
        const { dispatcher } = makeMockDispatcher();
        const result = await executeRoutine(routine, {}, dispatcher);
        expect(result.success).toBe(true);
    });
});
