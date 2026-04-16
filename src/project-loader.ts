import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type { AuthStrategy, SessionAuthConfig } from './auth/types';
import type { CommandRegistrar, DispatcherHandler, CustomResolver } from './types';

const BUILTIN_RESOLVER_NAMES = new Set([
    '_random_hex_color',
    '_uuid',
    '_random_int',
    '_random_from',
    '_random_distinct_from',
]);

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

export async function loadProjectResolvers(
    apijackDir: string,
): Promise<Map<string, CustomResolver>> {
    const resDir = join(apijackDir, 'resolvers');

    if (!existsSync(resDir)) return new Map();

    const resolvers = new Map<string, CustomResolver>();
    const files = readdirSync(resDir).filter(f => f.endsWith('.ts'));

    for (const file of files) {
        try {
            const mod = await import(join(resDir, file));
            const name = mod.name ?? basename(file, '.ts');
            const resolver = mod.default as CustomResolver;

            if (typeof resolver !== 'function') continue;

            if (typeof name !== 'string' || !name.startsWith('_')) {
                process.stderr.write(
                    `Warning: skipping resolver "${file}" — name "${name}" must start with "_" (e.g. "_my_fn")\n`,
                );
                continue;
            }

            if (BUILTIN_RESOLVER_NAMES.has(name)) {
                process.stderr.write(
                    `Warning: skipping resolver "${file}" — name "${name}" collides with a built-in\n`,
                );
                continue;
            }

            resolvers.set(name, resolver);
        } catch {
            // Skip files that fail to import
        }
    }

    return resolvers;
}
