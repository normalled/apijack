import type { RoutineContext } from './types';

const REF_PATTERN = /\$([a-zA-Z_][a-zA-Z0-9_\-]*(?:\.[a-zA-Z0-9_][a-zA-Z0-9_\-]*)*)/g;
// No-arg built-in functions (match without parentheses)
const NOARG_FUNC_PATTERN = /\$(_random_hex_color|_uuid)/g;
// Parameterized built-in functions (require parentheses)
const PARAM_FUNC_PATTERN = /\$(_random_int|_random_from|_random_distinct_from|_env|_find|_contains)\(([^)]*)\)/g;

// ── Built-in functions ─────────────────────────────────────────────

/** Fisher-Yates shuffle — unbiased random permutation. */
export function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];

    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
    }

    return a;
}

// Tracks distinct pool state per expression across iterations
const distinctPools = new Map<string, unknown[]>();

export function resetDistinctPools(): void {
    distinctPools.clear();
}

function evalBuiltinFunc(name: string, argsStr?: string, ctx?: RoutineContext): unknown {
    switch (name) {
        case '_random_hex_color': {
            const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');

            return `#${hex}`;
        }
        case '_uuid':
            return crypto.randomUUID();
        case '_random_int': {
            if (!argsStr) return 0;

            const [minStr, maxStr] = argsStr.split(',').map(s => s.trim());
            const min = parseInt(minStr, 10);
            const max = parseInt(maxStr, 10);

            if (isNaN(min) || isNaN(max)) {
                process.stderr.write(`Warning: $_random_int requires numeric args, got (${argsStr})\n`);

                return 0;
            }

            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        case '_random_from': {
            if (!argsStr) return '';

            const options = argsStr.split(',').map(s => s.trim());

            return options[Math.floor(Math.random() * options.length)];
        }
        case '_random_distinct_from': {
            if (!argsStr) return '';

            const poolKey = argsStr;
            let pool = distinctPools.get(poolKey);

            if (!pool || pool.length === 0) {
            // Reshuffle and refill
                const items = argsStr.split(',').map(s => s.trim());
                pool = shuffle(items);
                distinctPools.set(poolKey, pool);
            }

            return pool.pop()!;
        }
        case '_env': {
            if (!argsStr) return '';

            const firstComma = argsStr.indexOf(',');
            const varName = (firstComma === -1 ? argsStr : argsStr.slice(0, firstComma)).trim();
            const defaultVal = firstComma === -1 ? undefined : argsStr.slice(firstComma + 1).trim();

            const value = process.env[varName];

            if (value !== undefined) return value;

            if (defaultVal !== undefined) return defaultVal;

            process.stderr.write(`Warning: env var ${varName} is not set\n`);

            return '';
        }
        case '_find': {
            if (!argsStr || !ctx) return undefined;

            const parts = argsStr.split(',').map(s => s.trim());

            if (parts.length < 3) {
                process.stderr.write(`Warning: $_find requires (array, field, value), got (${argsStr})\n`);

                return undefined;
            }

            const arr = resolveValue(parts[0]!, ctx);
            const field = stripQuotes(parts[1]!);
            const value = resolveValue(parts.slice(2).join(',').trim(), ctx);

            if (!Array.isArray(arr)) return undefined;

            return arr.find(el =>
                el != null
                && typeof el === 'object'
                && String((el as Record<string, unknown>)[field]) === String(value),
            );
        }
        case '_contains': {
            const found = evalBuiltinFunc('_find', argsStr, ctx);

            return found !== undefined ? 'true' : 'false';
        }
        default:
            return undefined;
    }
}

function stripQuotes(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }

    return s;
}

function getByDotPath(obj: unknown, path: string[]): unknown {
    let current = obj;

    for (const key of path) {
        if (current == null || typeof current !== 'object') return undefined;

        current = (current as Record<string, unknown>)[key];
    }

    return current;
}

export function resolveRef(ref: string, ctx: RoutineContext): unknown {
    const parts = ref.split('.');
    const root = parts[0]!;
    const rest = parts.slice(1);

    // 1. forEach item variable
    if (ctx.forEachItem && ctx.forEachItem.name === root) {
        return rest.length > 0 ? getByDotPath(ctx.forEachItem.value, rest) : ctx.forEachItem.value;
    }

    // 2. Step output
    const step = ctx.stepOutputs.get(root);

    if (step) {
        if (rest.length === 0) return step.output;

        if (rest[0] === 'success') return step.success;

        return getByDotPath(step.output, rest);
    }

    // 3. Top-level variables
    if (root in ctx.variables) {
        const val = ctx.variables[root];

        return rest.length > 0 ? getByDotPath(val, rest) : val;
    }

    return undefined;
}

export function resolveValue(value: unknown, ctx: RoutineContext): unknown {
    if (typeof value !== 'string') return value;

    if (!value.includes('$')) return value;

    // Exact match: built-in function (no args)
    const funcExact = value.match(/^\$(_random_hex_color|_uuid)$/);

    if (funcExact) {
        return evalBuiltinFunc(funcExact[1]!, undefined, ctx);
    }

    // Exact match: built-in function with args
    const funcCall = value.match(/^\$(_random_int|_random_from|_random_distinct_from|_env|_find|_contains)\(([^)]*)\)$/);

    if (funcCall) {
        return evalBuiltinFunc(funcCall[1]!, funcCall[2], ctx);
    }

    // Exact match: entire value is a single $ref — resolve to native type
    const match = value.match(/^\$([a-zA-Z_][a-zA-Z0-9_\-]*(?:\.[a-zA-Z0-9_][a-zA-Z0-9_\-]*)*)$/);

    if (match) {
        return resolveRef(match[1]!, ctx);
    }

    // Inline interpolation: resolve $refs and functions embedded in the string
    return resolveString(value, ctx);
}

export function resolveString(str: string, ctx: RoutineContext): string {
    // First resolve parameterized built-in functions (require parens)
    let result = str.replace(PARAM_FUNC_PATTERN, (_match, name: string, argsStr: string) => {
        const resolved = evalBuiltinFunc(name, argsStr, ctx);

        return resolved !== undefined ? String(resolved) : _match;
    });
    // Then no-arg built-in functions
    result = result.replace(NOARG_FUNC_PATTERN, (_match, name: string) => {
        const resolved = evalBuiltinFunc(name, undefined, ctx);

        return resolved !== undefined ? String(resolved) : _match;
    });
    // Then resolve variable references
    result = result.replace(REF_PATTERN, (_match, ref: string) => {
        const resolved = resolveRef(ref, ctx);

        if (resolved === undefined) {
            process.stderr.write(`Warning: unresolved reference $${ref}\n`);

            return '';
        }

        return String(resolved);
    });

    return result;
}

export function resolveArgs(
    args: Record<string, string | number | boolean> | undefined,
    ctx: RoutineContext,
): Record<string, unknown> {
    if (!args) return {};

    const resolved: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(args)) {
        resolved[key] = resolveValue(val, ctx);
    }

    return resolved;
}

export function resolvePositionalArgs(
    args: (string | number)[] | undefined,
    ctx: RoutineContext,
): unknown[] {
    if (!args) return [];

    return args.map(a => resolveValue(a, ctx));
}
