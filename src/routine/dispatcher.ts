import type { CliContext, DispatcherHandler, CommandDispatcher, CustomResolver } from '../types';
import type { PluginRegistry } from '../plugin/registry';
import { loadRoutineFile, validateRoutine } from './loader';
import { executeRoutine } from './executor';

export interface DispatcherConfig {
    commandMap?: Record<string, {
        operationId: string;
        pathParams: string[];
        queryParams: string[];
        hasBody: boolean;
        bodyFields?: Array<{ name: string; type: string; required: boolean; description?: string }>;
    }>;
    client?: Record<string, unknown>;
    consumerHandlers?: Map<string, DispatcherHandler>;
    customResolvers?: Map<string, CustomResolver>;
    pluginRegistry?: PluginRegistry;
    preDispatch?: (command: string, args: Record<string, unknown>, ctx: CliContext) => Promise<void>;
    ctx: CliContext;
    routinesDir: string;
    builtinsMap?: Record<string, string>;
    /** @internal — test injection for loadRoutineFile */
    _loadRoutineFile?: typeof loadRoutineFile;
    /** @internal — test injection for validateRoutine */
    _validateRoutine?: typeof validateRoutine;
    /** @internal — test injection for executeRoutine */
    _executeRoutine?: typeof executeRoutine;
}

export function buildDispatcher(config: DispatcherConfig): CommandDispatcher {
    const _load = config._loadRoutineFile ?? loadRoutineFile;
    const _validate = config._validateRoutine ?? validateRoutine;
    const _execute = config._executeRoutine ?? executeRoutine;

    const dispatch: CommandDispatcher = async (
        command: string,
        args: Record<string, unknown>,
        positionalArgs?: unknown[],
    ): Promise<unknown> => {
    // 1. Pre-dispatch hook
        if (config.preDispatch) {
            await config.preDispatch(command, args, config.ctx);
        }

        // 2. Generated command-map
        if (config.commandMap && config.commandMap[command]) {
            const mapping = config.commandMap[command]!;
            const methodName = mapping.operationId;
            const method = config.client?.[methodName] as ((...args: unknown[]) => Promise<unknown>) | undefined;

            if (!method) throw new Error(`Client method "${methodName}" not found`);

            const callArgs: unknown[] = [];
            const posArgs = positionalArgs ? [...positionalArgs] : [];

            // Path params from positional args or flags
            for (const param of mapping.pathParams) {
                callArgs.push(posArgs.shift() ?? args[`--${param}`]);
            }

            // Body from args
            if (mapping.hasBody) {
                const body: Record<string, unknown> = {};
                const bodyFieldNames = new Set(mapping.bodyFields?.map(f => f.name) ?? []);

                for (const [key, val] of Object.entries(args)) {
                    if (key.startsWith('--')) {
                        const propName = key.slice(2);
                        const isBodyField = bodyFieldNames.has(propName);
                        // A field that's declared as a body field stays in the body
                        // even if its name collides with a path or query param.
                        const isPathParam = mapping.pathParams.includes(propName);
                        const isQueryParam = mapping.queryParams.includes(propName);

                        if (isBodyField || (!isPathParam && !isQueryParam)) {
                            body[propName] = val;
                        }
                    }
                }

                if (Object.keys(body).length > 0) callArgs.push(body);
            }

            // Query params
            if (mapping.queryParams.length > 0) {
                const queryObj: Record<string, unknown> = {};

                for (const param of mapping.queryParams) {
                    const val = args[`--${param}`];

                    if (val !== undefined) queryObj[param] = val;
                }

                if (Object.keys(queryObj).length > 0) callArgs.push(queryObj);
            }

            return await method.call(config.client as Record<string, unknown>, ...callArgs);
        }

        // 3. Consumer-registered dispatchers
        if (config.consumerHandlers?.has(command)) {
            const handler = config.consumerHandlers.get(command)!;

            return await handler(args, positionalArgs ?? [], config.ctx);
        }

        // 4. Built-in meta-commands

        // wait-until — poll with --interval (default 3s) and --timeout (default 120s) until truthy result
        if (command === 'wait-until') {
            const pollCmd = String(positionalArgs?.[0] || '');

            if (!pollCmd) throw new Error('wait-until requires a command to poll');

            const interval = Number(args['--interval'] || 3) * 1000;
            const timeout = Number(args['--timeout'] || 120) * 1000;

            const pollArgs: Record<string, unknown> = {};

            for (const [k, v] of Object.entries(args)) {
                if (!['--interval', '--timeout'].includes(k)) pollArgs[k] = v;
            }

            const startTime = Date.now();
            let polls = 0;

            while (Date.now() - startTime < timeout) {
                try {
                    const result = await dispatch(pollCmd, pollArgs, positionalArgs?.slice(1));

                    // Truthy check: non-zero number, non-empty string/array/object
                    if (
                        result !== 0
                        && result !== null
                        && result !== undefined
                        && result !== ''
                        && !(Array.isArray(result) && result.length === 0)
                    ) {
                        if (polls > 0) process.stderr.write('\n');

                        return result;
                    }
                } catch {
                    // Poll command failed — keep trying
                }
                polls++;
                await new Promise(r => setTimeout(r, interval));
                process.stderr.write('.');
            }

            if (polls > 0) process.stderr.write('\n');

            throw new Error(`wait-until timed out after ${timeout / 1000}s waiting for truthy result from: ${pollCmd}`);
        }

        // session refresh — call ctx.refreshSession()
        if (command === 'session refresh') {
            await config.ctx.refreshSession();

            return { refreshed: true };
        }

        // routine run — load and execute sub-routine
        if (command === 'routine run') {
            const routineName = String(positionalArgs?.[0] || '');

            if (!routineName) throw new Error('routine run requires a routine name');

            const subDef = _load(routineName, config.routinesDir, config.builtinsMap);
            const subErrors = _validate(subDef);

            if (subErrors.length > 0) throw new Error(`Sub-routine validation failed: ${subErrors.join(', ')}`);

            // Pass through any --set- overrides from args
            const subOverrides: Record<string, unknown> = {};

            for (const [k, v] of Object.entries(args)) {
                if (k.startsWith('--set-')) subOverrides[k.slice(6)] = v;
            }

            // Sub-routine plugin scoping:
            // - If sub has its own `plugins:` block, pass the registry so
            //   createRoutineResolvers is re-invoked with sub's opts (fresh closures
            //   that shadow the parent's for this subtree).
            // - If sub has no `plugins:` block, suppress re-invocation by omitting
            //   the registry; the executor's buildRoutineResolvers returns the
            //   parent's resolver map unchanged (inherits parent's closures).
            const subHasPlugins = !!subDef.plugins && Object.keys(subDef.plugins).length > 0;

            const result = await _execute(subDef, subOverrides, dispatch, {
                customResolvers: config.customResolvers,
                pluginRegistry: subHasPlugins ? config.pluginRegistry : undefined,
            });

            if (!result.success) throw new Error(`Sub-routine "${routineName}" failed`);

            return result;
        }

        // 5. Unknown command
        throw new Error(`Unknown command: "${command}"`);
    };

    return dispatch;
}
