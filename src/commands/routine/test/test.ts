import type { CommandDispatcher, CustomResolver } from '../../../types';
import type { RoutineDefinition, RoutineStep } from '../../../routine/types';
import type { RoutineResult } from '../../../routine/executor';

export interface RoutineTestDeps {
    loadSpec: () => RoutineDefinition | null;
    validateRoutine: (def: RoutineDefinition) => string[];
    executeRoutine: (def: RoutineDefinition, overrides: Record<string, unknown>, dispatch: CommandDispatcher, opts: { customResolvers?: Map<string, CustomResolver>; onStep?: RoutineTestDeps['onStep']; onIteration?: RoutineTestDeps['onIteration'] }) => Promise<RoutineResult>;
    dispatch: CommandDispatcher;
    overrides: Record<string, unknown>;
    customResolvers?: Map<string, CustomResolver>;
    routineName?: string;
    onStep?: (step: RoutineStep, i: number, total: number) => void;
    onIteration?: (step: RoutineStep, current: number, total: number, stepIndex: number, stepTotal: number) => void;
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
        customResolvers: deps.customResolvers,
        onStep: deps.onStep,
        onIteration: deps.onIteration,
    });
}
