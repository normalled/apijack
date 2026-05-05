import type {
    RoutineDefinition,
    RoutineStep,
    RoutineContext,
    StepResult,
} from './types';
import {
    resolveValue,
    resolveArgs,
    resolvePositionalArgs,
    resetDistinctPools,
    shuffle,
} from './resolver';
import { evaluateCondition } from './condition';
import { buildRoutineResolvers } from './plugin-resolvers';
import type { CommandDispatcher, CustomResolver } from '../types';
import type { PluginRegistry } from '../plugin/registry';

export interface RoutineResultStep {
    name: string;
    status: 'ok' | 'failed' | 'skipped';
    output?: unknown;
    error?: string;
    iteration?: { index: number; total: number };
}

export interface RoutineResult {
    status: 'ok' | 'failed';
    success: boolean;
    output: Record<string, unknown>;
    steps: RoutineResultStep[];
    durationMs: number;
    stepsRun: number;
    stepsSkipped: number;
    stepsFailed: number;
    error?: string;
}

interface ExecutorOptions {
    dryRun?: boolean;
    silent?: boolean;
    customResolvers?: Map<string, CustomResolver>;
    pluginRegistry?: PluginRegistry;
    onStep?: (step: RoutineStep, index: number, total: number) => void;
    onIteration?: (
        step: RoutineStep,
        current: number,
        total: number,
        stepIndex: number,
        stepTotal: number,
    ) => void;
}

class RoutineExecutor {
    private stepsRun = 0;
    private stepsSkipped = 0;
    private stepsFailed = 0;
    private inIteration = false;
    private currentIteration: { index: number; total: number } | null = null;
    private steps: RoutineResultStep[] = [];
    private namedOutput: Record<string, unknown> = {};

    private pushStep(entry: RoutineResultStep): void {
        if (this.currentIteration) {
            entry.iteration = { ...this.currentIteration };
        }

        this.steps.push(entry);
    }

    constructor(
        private dispatch: CommandDispatcher,
        private options?: ExecutorOptions,
    ) {}

    async execute(
        routine: RoutineDefinition,
        overrides: Record<string, unknown>,
    ): Promise<RoutineResult> {
        const startTime = Date.now();
        const builtins: Record<string, unknown> = {
            _timestamp: Math.floor(Date.now() / 1000),
            _date: new Date().toISOString().slice(0, 10),
        };
        // Merge variables: builtins < routine defaults < overrides
        const rawVars = { ...builtins, ...routine.variables, ...overrides };
        // Resolve $references in default variable values (e.g. "run-$_timestamp")
        const REF = /\$([a-zA-Z_][a-zA-Z0-9_\-]*)/g;

        for (const [key, val] of Object.entries(rawVars)) {
            if (typeof val === 'string' && val.includes('$')) {
                rawVars[key] = val.replace(REF, (_, ref: string) => {
                    const resolved = rawVars[ref];

                    return resolved !== undefined ? String(resolved) : `$${ref}`;
                });
            }
        }

        const ctx: RoutineContext = {
            variables: rawVars,
            stepOutputs: new Map(),
            customResolvers: buildRoutineResolvers(
                routine,
                this.options?.customResolvers,
                this.options?.pluginRegistry,
            ),
        };

        const ok = await this.runSteps(routine.steps, ctx);
        const success = ok && this.stepsFailed === 0;

        return {
            status: success ? 'ok' : 'failed',
            success,
            output: this.namedOutput,
            steps: this.steps,
            durationMs: Date.now() - startTime,
            stepsRun: this.stepsRun,
            stepsSkipped: this.stepsSkipped,
            stepsFailed: this.stepsFailed,
        };
    }

    private async runSteps(
        steps: RoutineStep[],
        ctx: RoutineContext,
    ): Promise<boolean> {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]!;

            if (!evaluateCondition(step.condition, ctx)) {
                this.stepsSkipped++;
                this.pushStep({ name: step.name, status: 'skipped' });

                if (this.options?.onStep && !this.inIteration)
                    this.options.onStep(step, i, steps.length);

                continue;
            }

            if (step.range && step.steps) {
                const ok = await this.runRange(step, ctx, i, steps.length);

                if (!ok) return false;

                continue;
            }

            if (step.forEach && step.steps) {
                const ok = await this.runForEach(step, ctx, i, steps.length);

                if (!ok) return false;

                continue;
            }

            if (!step.command) continue;

            const ok = await this.executeCommand(step, ctx, i, steps.length);

            if (!ok) return false;
        }

        return true;
    }

    private async runRange(
        step: RoutineStep,
        ctx: RoutineContext,
        stepIndex: number,
        totalSteps: number,
    ): Promise<boolean> {
        const [start, end] = step.range!;
        const items = Array.from({ length: end - start + 1 }, (_, i) => i + start);

        return this.runIteration(step, items, ctx, stepIndex, totalSteps);
    }

    private async runForEach(
        step: RoutineStep,
        ctx: RoutineContext,
        stepIndex: number,
        totalSteps: number,
    ): Promise<boolean> {
        const rawItems = resolveValue(step.forEach!, ctx);

        if (!Array.isArray(rawItems)) {
            if (!this.options?.silent) {
                process.stderr.write(
                    `Warning: forEach on "${step.name}" did not resolve to an array\n`,
                );
            }

            this.stepsSkipped++;
            this.pushStep({ name: step.name, status: 'skipped' });

            return true;
        }

        return this.runIteration(step, [...rawItems], ctx, stepIndex, totalSteps);
    }

    private async runIteration(
        step: RoutineStep,
        items: unknown[],
        ctx: RoutineContext,
        stepIndex: number,
        totalSteps: number,
    ): Promise<boolean> {
        if (step.shuffle) items = shuffle(items);

        if (step.reverse) items = items.reverse();

        resetDistinctPools();

        const asName = step.as || 'item';
        this.inIteration = true;
        const previousIteration = this.currentIteration;

        for (let i = 0; i < items.length; i++) {
            if (this.options?.onIteration)
                this.options.onIteration(
                    step,
                    i + 1,
                    items.length,
                    stepIndex,
                    totalSteps,
                );

            this.currentIteration = { index: i, total: items.length };

            const iterCtx: RoutineContext = {
                ...ctx,
                forEachItem: { name: asName, value: items[i] },
            };
            const ok = await this.runSteps(step.steps!, iterCtx);

            if (!ok && !step.continueOnError) {
                this.inIteration = false;
                this.currentIteration = previousIteration;

                return false;
            }
        }

        this.inIteration = false;
        this.currentIteration = previousIteration;

        if (this.options?.onIteration && !this.options.silent) process.stderr.write('\n');

        return true;
    }

    private async executeCommand(
        step: RoutineStep,
        ctx: RoutineContext,
        stepIndex: number,
        totalSteps: number,
    ): Promise<boolean> {
        if (this.options?.onStep && !this.inIteration)
            this.options.onStep(step, stepIndex, totalSteps);

        const resolvedArgs = resolveArgs(step.args, ctx);
        const resolvedPositional = resolvePositionalArgs(
            step['args-positional'],
            ctx,
        );

        if (this.options?.dryRun) {
            if (!this.options.silent) {
                const argStr = Object.entries(resolvedArgs)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(' ');
                const posStr = resolvedPositional.join(' ');
                console.log(
                    `[${this.stepsRun + 1}] ${step.name}: ${step.command} ${posStr} ${argStr}`.trim(),
                );
            }

            this.stepsRun++;

            return true;
        }

        try {
            const result = await this.dispatch(
                step.command!,
                resolvedArgs,
                resolvedPositional,
                ctx,
            );
            const stepResult: StepResult = {
                name: step.name,
                success: true,
                output: result,
            };
            ctx.stepOutputs.set(step.name, stepResult);

            if (step.output) ctx.stepOutputs.set(step.output, stepResult);

            this.stepsRun++;
            this.pushStep({ name: step.name, status: 'ok', output: result });

            if (step.output) this.namedOutput[step.output] = result;

            if (step.assert) {
                const passed = evaluateCondition(step.assert, ctx);

                if (!passed) {
                    if (!this.options?.silent) {
                        console.error(`Assert failed on "${step.name}": ${step.assert}`);
                    }

                    stepResult.success = false;
                    stepResult.error = `Assertion failed: ${step.assert}`;
                    this.stepsFailed++;
                    // overwrite the previously-pushed 'ok' with the failed entry,
                    // preserving the iteration tag if any
                    const overwrite: RoutineResultStep = {
                        name: step.name,
                        status: 'failed',
                        error: stepResult.error,
                    };

                    if (this.currentIteration) {
                        overwrite.iteration = { ...this.currentIteration };
                    }

                    this.steps[this.steps.length - 1] = overwrite;

                    if (step.output) delete this.namedOutput[step.output];

                    if (!step.continueOnError) return false;
                }
            }
        } catch (err) {
            let errMsg: string;

            if (err instanceof Error) {
                errMsg = err.message;
            } else if (typeof err === 'object' && err !== null && 'status' in err) {
                const { status, body } = err as Record<string, unknown>;
                errMsg = `HTTP ${status}: ${body}`;
            } else {
                errMsg = String(err);
            }

            const stepResult: StepResult = {
                name: step.name,
                success: false,
                output: null,
                error: errMsg,
            };
            ctx.stepOutputs.set(step.name, stepResult);

            if (step.output) ctx.stepOutputs.set(step.output, stepResult);

            this.stepsFailed++;
            this.stepsRun++;

            if (!this.options?.silent) {
                console.error(`Step "${step.name}" failed: ${errMsg}`);
            }

            this.pushStep({ name: step.name, status: 'failed', error: errMsg });

            if (!step.continueOnError) return false;
        }

        return true;
    }
}

export async function executeRoutine(
    routine: RoutineDefinition,
    overrides: Record<string, unknown>,
    dispatch: CommandDispatcher,
    options?: ExecutorOptions,
): Promise<RoutineResult> {
    return new RoutineExecutor(dispatch, options).execute(routine, overrides);
}
