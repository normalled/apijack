import type { CommandDispatcher } from '../../../types';

export interface RoutineTestDeps {
    loadSpec: () => any | null;
    validateRoutine: (def: any) => string[];
    executeRoutine: (def: any, overrides: Record<string, unknown>, dispatch: CommandDispatcher, opts: any) => Promise<{ success: boolean; stepsRun: number; stepsSkipped: number; stepsFailed: number }>;
    dispatch: CommandDispatcher;
    overrides: Record<string, unknown>;
    routineName?: string;
    onStep?: (step: any, i: number, total: number) => void;
    onIteration?: (step: any, current: number, total: number, stepIndex: number, stepTotal: number) => void;
}

export async function routineTestAction(deps: RoutineTestDeps): Promise<{ success: boolean; stepsRun: number; stepsSkipped: number; stepsFailed: number }> {
    const spec = deps.loadSpec();
    if (!spec) {
        throw new Error(`No spec.yaml found for routine "${deps.routineName}".`);
    }

    const errors = deps.validateRoutine(spec);
    if (errors.length > 0) {
        throw new Error(`Spec validation errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }

    return deps.executeRoutine(spec, deps.overrides, deps.dispatch, {
        onStep: deps.onStep,
        onIteration: deps.onIteration,
    });
}
