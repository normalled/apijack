import type { CommandDispatcher } from '../../../types';

export interface RoutineRunDeps {
    loadRoutine: () => any;
    validateRoutine: (def: any) => string[];
    executeRoutine: (def: any, overrides: Record<string, unknown>, dispatch: CommandDispatcher, opts: any) => Promise<{ success: boolean; stepsRun: number; stepsSkipped: number; stepsFailed: number }>;
    dispatch: CommandDispatcher;
    overrides: Record<string, unknown>;
    dryRun?: boolean;
    invalidateSession: () => void;
    onStep?: (step: any, i: number, total: number) => void;
    onIteration?: (step: any, current: number, total: number, stepIndex: number, stepTotal: number) => void;
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
