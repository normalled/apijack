import { describe, test, expect } from 'bun:test';
import { routineListAction } from './list';

describe('routineListAction', () => {
    test('returns routines', () => {
        const result = routineListAction({
            listRoutines: () => ['setup/create-project', 'deploy/staging'],
        });
        expect(result).toEqual(['setup/create-project', 'deploy/staging']);
    });

    test('filters by path prefix', () => {
        const routines = ['setup/create-project', 'setup/teardown', 'deploy/staging'];
        const result = routineListAction({
            listRoutines: () => routines,
            path: 'setup',
        });
        expect(result).toEqual(['create-project', 'teardown']);
    });

    test('returns empty when no match', () => {
        const result = routineListAction({
            listRoutines: () => ['setup/create-project'],
            path: 'deploy',
        });
        expect(result).toEqual([]);
    });
});
