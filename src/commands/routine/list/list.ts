export interface RoutineListDeps {
    listRoutines: () => string[];
    path?: string;
}

export function routineListAction(deps: RoutineListDeps): string[] {
    const routines = deps.listRoutines();

    if (!deps.path) return routines;

    const prefix = deps.path.replace(/\/+$/, '');

    return routines
        .filter((r) => {
            const clean = r.replace(/\x1b\[[0-9;]*m/g, '').trim();

            return clean.startsWith(prefix + '/');
        })
        .map((r) => {
            const clean = r.replace(/\x1b\[[0-9;]*m/g, '').trim();

            return clean.slice(prefix.length + 1);
        });
}
