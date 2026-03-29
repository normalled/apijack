export interface RoutineValidateDeps {
    loadRoutine: () => { name: string; steps: unknown[] };
    validateRoutine: (def: any) => string[];
}

export interface RoutineValidateResult {
    valid: boolean;
    name: string;
    errors: string[];
}

export function routineValidateAction(deps: RoutineValidateDeps): RoutineValidateResult {
    const def = deps.loadRoutine();
    const errors = deps.validateRoutine(def);
    return { valid: errors.length === 0, name: def.name, errors };
}
