import type { Command } from 'commander';
import type { AuthStrategy, AuthSession, ResolvedAuth, SessionAuthConfig } from './auth/types';

export interface CliContext {
    client: unknown;
    session: AuthSession | null;
    auth: ResolvedAuth;
    strategy: AuthStrategy;
    refreshSession(): Promise<void>;
    resolveSession(): Promise<void>;
    saveSession(): Promise<void>;
}

export interface AuthedCliContext extends CliContext {
    session: AuthSession;
}

export interface CliOptions {
    name: string;
    description: string;
    version: string;
    specPath: string;
    auth: AuthStrategy;
    sessionAuth?: SessionAuthConfig;
    outputModes?: string[];
    generatedDir?: string;
    knownSites?: Record<string, { url: string; description: string; group?: string }>;
    setupHook?: () => Promise<void>;
    builtinRoutinesDir?: string;
    preDispatch?: (command: string, args: Record<string, unknown>, ctx: CliContext) => Promise<void>;
    allowedCidrs?: string[];
    configPath?: string;
    customCommandDefaults?: { requiresAuth?: boolean };
}

export type CommandRegistrar<R extends boolean = false> = R extends true
    ? (program: Command, ctx: AuthedCliContext) => void
    : (program: Command, ctx: CliContext) => void;

export type DispatcherHandler<R extends boolean = false> = R extends true
    ? (args: Record<string, unknown>, positionalArgs: unknown[], ctx: AuthedCliContext) => Promise<unknown>
    : (args: Record<string, unknown>, positionalArgs: unknown[], ctx: CliContext) => Promise<unknown>;

export interface CustomResolverHelpers {
    /** Resolve `$refs` and built-in functions inside a string against the current routine context. */
    resolve: (value: string) => unknown;
}

export type CustomResolver = (argsStr?: string, helpers?: CustomResolverHelpers) => unknown;

export type CommandDispatcher = (
    command: string,
    args: Record<string, unknown>,
    positionalArgs?: unknown[],
) => Promise<unknown>;
