import { describe, expect, test } from 'bun:test';
import { evaluateCondition } from '../../src/routine/condition';
import type { RoutineContext } from '../../src/routine/types';

function makeCtx(overrides: Partial<RoutineContext> = {}): RoutineContext {
    return {
        variables: {},
        stepOutputs: new Map(),
        ...overrides,
    };
}

describe('evaluateCondition', () => {
    test('undefined condition returns true', () => {
        const ctx = makeCtx();
        expect(evaluateCondition(undefined, ctx)).toBe(true);
    });

    test('"true" string returns true', () => {
        const ctx = makeCtx();
        expect(evaluateCondition('true', ctx)).toBe(true);
    });

    test('"false" string returns false', () => {
        const ctx = makeCtx();
        expect(evaluateCondition('false', ctx)).toBe(false);
    });

    test('equality check: $var == value', () => {
        const ctx = makeCtx({ variables: { status: 'active' } });
        expect(evaluateCondition('$status == active', ctx)).toBe(true);
        expect(evaluateCondition('$status == inactive', ctx)).toBe(false);
    });

    test('inequality check: $var != value', () => {
        const ctx = makeCtx({ variables: { status: 'active' } });
        expect(evaluateCondition('$status != inactive', ctx)).toBe(true);
        expect(evaluateCondition('$status != active', ctx)).toBe(false);
    });

    test('truthy check: $var', () => {
        const ctx = makeCtx({ variables: { enabled: true, disabled: false, empty: '' } });
        expect(evaluateCondition('$enabled', ctx)).toBe(true);
        expect(evaluateCondition('$disabled', ctx)).toBe(false);
        expect(evaluateCondition('$empty', ctx)).toBe(false);
    });

    test('RHS can be a $ref: $var == $other', () => {
        const ctx = makeCtx({ variables: { a: 'hello', b: 'hello', c: 'world' } });
        expect(evaluateCondition('$a == $b', ctx)).toBe(true);
        expect(evaluateCondition('$a == $c', ctx)).toBe(false);
    });

    test('RHS $ref works with inequality: $var != $other', () => {
        const ctx = makeCtx({ variables: { a: 'hello', b: 'world' } });
        expect(evaluateCondition('$a != $b', ctx)).toBe(true);
    });

    test('$_find == undefined: true when array is empty', () => {
        const ctx = makeCtx({ variables: { name: 'bob' } });
        ctx.stepOutputs.set('items', { name: 'items', success: true, output: [] });
        expect(evaluateCondition('$_find($items, name, $name) == undefined', ctx)).toBe(true);
    });

    test('$_find == undefined: true when value missing', () => {
        const ctx = makeCtx({ variables: { name: 'carol' } });
        ctx.stepOutputs.set('items', {
            name: 'items',
            success: true,
            output: [{ name: 'alice' }, { name: 'bob' }],
        });
        expect(evaluateCondition('$_find($items, name, $name) == undefined', ctx)).toBe(true);
    });

    test('$_find == undefined: false when value is present', () => {
        const ctx = makeCtx({ variables: { name: 'alice' } });
        ctx.stepOutputs.set('items', {
            name: 'items',
            success: true,
            output: [{ name: 'alice' }, { name: 'bob' }],
        });
        expect(evaluateCondition('$_find($items, name, $name) == undefined', ctx)).toBe(false);
    });

    test('$_contains == "true" when present', () => {
        const ctx = makeCtx({ variables: { name: 'alice' } });
        ctx.stepOutputs.set('items', {
            name: 'items',
            success: true,
            output: [{ name: 'alice' }, { name: 'bob' }],
        });
        expect(evaluateCondition('$_contains($items, name, $name) == "true"', ctx)).toBe(true);
        expect(evaluateCondition('$_contains($items, name, $name) == "false"', ctx)).toBe(false);
    });

    test('$_contains == "false" when absent', () => {
        const ctx = makeCtx({ variables: { name: 'carol' } });
        ctx.stepOutputs.set('items', {
            name: 'items',
            success: true,
            output: [{ name: 'alice' }, { name: 'bob' }],
        });
        expect(evaluateCondition('$_contains($items, name, $name) == "false"', ctx)).toBe(true);
        expect(evaluateCondition('$_contains($items, name, $name) == "true"', ctx)).toBe(false);
    });
});
