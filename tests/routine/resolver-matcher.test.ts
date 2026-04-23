import { describe, expect, test } from 'bun:test';
import { findFunctionCalls, isExactFunctionCall } from '../../src/routine/resolver-matcher';

describe('findFunctionCalls', () => {
    test('returns empty for input without $_ prefix', () => {
        expect(findFunctionCalls('hello world')).toEqual([]);
        expect(findFunctionCalls('$var and $step.field')).toEqual([]);
    });

    test('matches a single top-level call', () => {
        const input = 'before $_foo(a, b) after';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ name: '_foo', argsStr: 'a, b', start: 7, end: 18 });
    });

    test('matches no-arg call followed by parens', () => {
        const input = '$_uuid()';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ name: '_uuid', argsStr: '' });
    });

    test('matches multiple top-level calls in sequence', () => {
        const input = '$_foo(a) and $_bar(b)';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(2);
        expect(result[0]?.name).toBe('_foo');
        expect(result[1]?.name).toBe('_bar');
    });

    test('handles nested $_foo(..., $_bar(...))', () => {
        const input = '$_foo(a, $_bar(b, c))';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('_foo');
        expect(result[0]?.argsStr).toBe('a, $_bar(b, c)');
    });

    test('balances braces inside args', () => {
        const input = '$_foo({a: 1, b: {c: 2}})';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.argsStr).toBe('{a: 1, b: {c: 2}}');
    });

    test('balances brackets inside args', () => {
        const input = '$_foo([1, [2, 3]])';
        expect(findFunctionCalls(input)[0]?.argsStr).toBe('[1, [2, 3]]');
    });

    test('respects double-quoted strings containing close paren', () => {
        const input = '$_foo("has ) inside", "ok")';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.argsStr).toBe('"has ) inside", "ok"');
    });

    test('respects single-quoted strings containing delimiters', () => {
        const input = "$_foo('has } and ] inside')";
        expect(findFunctionCalls(input)).toHaveLength(1);
    });

    test('respects escaped quotes inside strings', () => {
        const input = '$_foo("has \\" inside")';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.argsStr).toBe('"has \\" inside"');
    });

    test('handles newlines inside args', () => {
        const input = '$_foo(\n  a,\n  b\n)';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.argsStr).toBe('\n  a,\n  b\n');
    });

    test('handles mixed delimiters', () => {
        const input = '$_foo({a: [1, "x)"], b: $_bar(z)})';
        const result = findFunctionCalls(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('_foo');
    });

    test('ignores $_name without parens (no-arg functions)', () => {
        const input = 'hello $_uuid world';
        expect(findFunctionCalls(input)).toEqual([]);
    });

    test('requires underscore after $', () => {
        expect(findFunctionCalls('$var(a)')).toEqual([]);
    });

    test('throws on unclosed parens', () => {
        expect(() => findFunctionCalls('$_foo(a, b')).toThrow(/unclosed/i);
    });

    test('throws on unclosed string literal', () => {
        expect(() => findFunctionCalls('$_foo("unclosed)')).toThrow(/unclosed/i);
    });
});

describe('isExactFunctionCall', () => {
    test('returns parsed call when input is exactly one call', () => {
        expect(isExactFunctionCall('$_foo(a, b)')).toEqual({ name: '_foo', argsStr: 'a, b' });
    });

    test('returns parsed call with empty args', () => {
        expect(isExactFunctionCall('$_uuid()')).toEqual({ name: '_uuid', argsStr: '' });
    });

    test('returns null when input has extra content', () => {
        expect(isExactFunctionCall('prefix $_foo(a)')).toBeNull();
        expect(isExactFunctionCall('$_foo(a) suffix')).toBeNull();
    });

    test('returns null when input is not a function call', () => {
        expect(isExactFunctionCall('$var')).toBeNull();
        expect(isExactFunctionCall('hello')).toBeNull();
    });
});
