import type { RoutineContext } from './types';
import { resolveRef, resolveValue } from './resolver';

// LHS captures a $ref or a $_func(...) built-in call
const LHS_PATTERN = '\\$[a-zA-Z_][a-zA-Z0-9_.\\-]*(?:\\([^)]*\\))?';

function resolveLhs(lhs: string, ctx: RoutineContext): unknown {
    return lhs.includes('(') ? resolveValue(lhs, ctx) : resolveRef(lhs.slice(1), ctx);
}

function resolveRhs(rhs: string, ctx: RoutineContext): { value: unknown; isUndefined: boolean } {
    if (rhs === 'undefined') return { value: undefined, isUndefined: true };

    if (rhs.startsWith('$')) return { value: resolveValue(rhs, ctx), isUndefined: false };

    // Strip surrounding quotes on literal RHS (e.g., == "true")
    if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) {
        return { value: rhs.slice(1, -1), isUndefined: false };
    }

    return { value: rhs, isUndefined: false };
}

export function evaluateCondition(expr: string | undefined, ctx: RoutineContext): boolean {
    if (expr === undefined || expr === null) return true;

    if (expr === 'true') return true;

    if (expr === 'false') return false;

    // Equality: <lhs> == value (RHS can also be a $ref or "undefined")
    const eqMatch = expr.match(new RegExp(`^(${LHS_PATTERN})\\s*==\\s*(.+)$`));

    if (eqMatch) {
        const resolved = resolveLhs(eqMatch[1]!, ctx);
        const rhs = resolveRhs(eqMatch[2]!.trim(), ctx);

        if (rhs.isUndefined) return resolved === undefined;

        return String(resolved) === String(rhs.value);
    }

    // Inequality: <lhs> != value (RHS can also be a $ref or "undefined")
    const neqMatch = expr.match(new RegExp(`^(${LHS_PATTERN})\\s*!=\\s*(.+)$`));

    if (neqMatch) {
        const resolved = resolveLhs(neqMatch[1]!, ctx);
        const rhs = resolveRhs(neqMatch[2]!.trim(), ctx);

        if (rhs.isUndefined) return resolved !== undefined;

        return String(resolved) !== String(rhs.value);
    }

    // Truthy check: $ref
    const refMatch = expr.match(/^\$([a-zA-Z_][a-zA-Z0-9_.\-]*)$/);

    if (refMatch) {
        const resolved = resolveRef(refMatch[1]!, ctx);

        return !!resolved;
    }

    return !!expr;
}
