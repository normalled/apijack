export interface RoutineInitDeps {
    routinesDir: string;
    builtinDir: string | undefined;
    exists: (path: string) => boolean;
    mkdir: (path: string, opts: { recursive: boolean }) => void;
    copy: (src: string, dest: string, opts: { recursive: boolean }) => void;
    listDir: (path: string) => string[];
}

export interface RoutineInitResult {
    installed: number;
    routinesDir: string;
}

export function routineInitAction(deps: RoutineInitDeps): RoutineInitResult {
    if (!deps.builtinDir || !deps.exists(deps.builtinDir)) {
        throw new Error('No built-in routines directory found.');
    }
    deps.mkdir(deps.routinesDir, { recursive: true });
    deps.copy(deps.builtinDir, deps.routinesDir, { recursive: true });
    const routines = deps.listDir(deps.builtinDir);
    return { installed: routines.length, routinesDir: deps.routinesDir };
}
