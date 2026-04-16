import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { AuthStrategy, SessionAuthConfig } from './auth/types';
import type { CommandRegistrar, DispatcherHandler } from './types';

export interface ProjectAuth {
    strategy: AuthStrategy | null;
    onChallenge: SessionAuthConfig['onChallenge'] | null;
}

export async function loadProjectAuth(
    apijackDir: string,
): Promise<ProjectAuth> {
    const authPath = join(apijackDir, 'auth.ts');

    if (!existsSync(authPath)) return { strategy: null, onChallenge: null };

    try {
        const mod = await import(authPath);

        const strategy = (mod.default ?? null) as AuthStrategy | null;
        const onChallenge = (mod.onChallenge ?? null) as SessionAuthConfig['onChallenge'] | null;

        return { strategy, onChallenge };
    } catch {
        return { strategy: null, onChallenge: null };
    }
}

export interface LoadedCommand {
    name: string;
    registrar: CommandRegistrar;
}

export async function loadProjectCommands(
    apijackDir: string,
): Promise<LoadedCommand[]> {
    const cmdDir = join(apijackDir, 'commands');

    if (!existsSync(cmdDir)) return [];

    const commands: LoadedCommand[] = [];
    const files = readdirSync(cmdDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
        try {
            const mod = await import(join(cmdDir, file));
            const name = mod.name ?? basename(file, '.ts');
            const registrar = mod.default as CommandRegistrar;

            if (typeof registrar === 'function') {
                commands.push({ name, registrar });
            }
        } catch {
            // Skip files that fail to import
        }
    }

    return commands;
}

export async function loadProjectDispatchers(
    apijackDir: string,
): Promise<Map<string, DispatcherHandler>> {
    const dispDir = join(apijackDir, 'dispatchers');

    if (!existsSync(dispDir)) return new Map();

    const dispatchers = new Map<string, DispatcherHandler>();
    const files = readdirSync(dispDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
        try {
            const mod = await import(join(dispDir, file));
            const name = mod.name ?? basename(file, '.ts');
            const handler = mod.default as DispatcherHandler;

            if (typeof handler === 'function') {
                dispatchers.set(name, handler);
            }
        } catch {
            // Skip files that fail to import
        }
    }

    return dispatchers;
}
