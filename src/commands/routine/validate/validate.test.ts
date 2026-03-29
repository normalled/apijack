import { describe, test, expect } from 'bun:test';
import { routineValidateAction } from './validate';

describe('routineValidateAction', () => {
    test('returns valid for correct routine', () => {
        const result = routineValidateAction({
            loadRoutine: () => ({ name: 'test', steps: [] }),
            validateRoutine: () => [],
        });
        expect(result.valid).toBe(true);
        expect(result.name).toBe('test');
    });

    test('returns errors for invalid routine', () => {
        const result = routineValidateAction({
            loadRoutine: () => ({ name: 'test', steps: [] }),
            validateRoutine: () => ['missing name', 'empty steps'],
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['missing name', 'empty steps']);
    });
});
