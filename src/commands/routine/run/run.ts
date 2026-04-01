import type { CommandDispatcher } from '../../../types';
import type { RoutineDefinition, RoutineStep } from '../../../routine/types';
import type { RoutineResult } from '../../../routine/executor';

export interface RoutineRunDeps {
    loadRoutine: () => RoutineDefinition;
    validateRoutine: (def: RoutineDefinition) => string[];
    executeRoutine: (def: RoutineDefinition, overrides: Record<string, unknown>, dispatch: CommandDispatcher, opts: { dryRun?: boolean; onStep?: RoutineRunDeps['onStep']; onIteration?: RoutineRunDeps['onIteration'] }) => Promise<RoutineResult>;
    dispatch: CommandDispatcher;
    overrides: Record<string, unknown>;
    dryRun?: boolean;
    invalidateSession: () => void;
    onStep?: (step: RoutineStep, i: number, total: number) => void;
    onIteration?: (step: RoutineStep, current: number, total: number, stepIndex: number, stepTotal: number) => void;
}

export async function routineRunAction(deps: RoutineRunDeps): Promise<{ success: boolean; stepsRun: number; stepsSkipped: number; stepsFailed: number; name: string; description?: string }> {
    const def = deps.loadRoutine();
    const errors = deps.validateRoutine(def);

    if (errors.length > 0) {
        throw new Error(`Validation errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }

    deps.invalidateSession();

    const result = await deps.executeRoutine(def, deps.overrides, deps.dispatch, {
        dryRun: deps.dryRun,
        onStep: deps.onStep,
        onIteration: deps.onIteration,
    });

    return { ...result, name: def.name, description: def.description };
}
