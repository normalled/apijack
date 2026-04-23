import { describe, expect, test } from 'bun:test';
import { buildRoutineResolvers } from '../../src/routine/plugin-resolvers';
import { PluginRegistry } from '../../src/plugin/registry';
import type { RoutineDefinition } from '../../src/routine/types';
import type { CustomResolver } from '../../src/types';

function mkRoutine(overrides: Partial<RoutineDefinition> = {}): RoutineDefinition {
    return { name: 'r', steps: [], variables: {}, ...overrides };
}

describe('buildRoutineResolvers', () => {
    test('returns a fresh map with stateless plugin resolvers merged in', () => {
        const reg = new PluginRegistry();
        reg.register({
            name: 'static',
            resolvers: { _static: () => 'S' },
        });
        const map = buildRoutineResolvers(mkRoutine(), undefined, reg);
        expect(map.has('_static')).toBe(true);
    });

    test('invokes createRoutineResolvers once per call', () => {
        const reg = new PluginRegistry();
        let calls = 0;
        reg.register({
            name: 'counter',
            createRoutineResolvers: () => {
                calls++;

                return { _counter: () => String(calls) };
            },
        });
        buildRoutineResolvers(mkRoutine(), undefined, reg);
        buildRoutineResolvers(mkRoutine(), undefined, reg);
        expect(calls).toBe(2);
    });

    test('passes plugins.<name> opts to createRoutineResolvers', () => {
        const reg = new PluginRegistry();
        const receivedOpts: unknown[] = [];
        reg.register({
            name: 'opts',
            createRoutineResolvers: (opts) => {
                receivedOpts.push(opts);

                return { _opts: () => '' };
            },
        });
        buildRoutineResolvers(
            mkRoutine({ plugins: { opts: { seed: 42 } } }),
            undefined,
            reg,
        );
        expect(receivedOpts).toEqual([{ seed: 42 }]);
    });

    test('passes {} when routine lacks plugins field for that plugin', () => {
        const reg = new PluginRegistry();
        const receivedOpts: unknown[] = [];
        reg.register({
            name: 'opts',
            createRoutineResolvers: (opts) => {
                receivedOpts.push(opts);

                return { _opts: () => '' };
            },
        });
        buildRoutineResolvers(mkRoutine(), undefined, reg);
        expect(receivedOpts).toEqual([{}]);
    });

    test('produces distinct closures per call (immutability)', () => {
        const reg = new PluginRegistry();
        reg.register({
            name: 'stateful',
            createRoutineResolvers: (opts) => {
                let n = (opts as { start?: number }).start ?? 0;

                return { _stateful: () => String(n++) };
            },
        });
        const m1 = buildRoutineResolvers(mkRoutine({ plugins: { stateful: { start: 0 } } }), undefined, reg);
        const m2 = buildRoutineResolvers(mkRoutine({ plugins: { stateful: { start: 100 } } }), undefined, reg);
        expect(m1.get('_stateful')!(undefined, undefined)).toBe('0');
        expect(m1.get('_stateful')!(undefined, undefined)).toBe('1');
        expect(m2.get('_stateful')!(undefined, undefined)).toBe('100');
        expect(m1.get('_stateful')!(undefined, undefined)).toBe('2');
    });

    test('warns to stderr when routine.plugins references unknown plugin', () => {
        const reg = new PluginRegistry();
        reg.register({ name: 'known', resolvers: { _known: () => '' } });
        let stderrOut = '';
        const orig = process.stderr.write.bind(process.stderr);
        process.stderr.write = ((c: string | Uint8Array) => {
            stderrOut += String(c);

            return true;
        }) as never;

        try {
            buildRoutineResolvers(
                mkRoutine({ plugins: { unknown: {}, known: {} } }),
                undefined,
                reg,
            );
        } finally {
            process.stderr.write = orig as never;
        }

        expect(stderrOut).toContain('unknown');
        // Known plugin should NOT trigger a warning
        expect(stderrOut).not.toMatch(/plugin "known".*unregistered/);
    });

    test('preserves global resolvers passed in', () => {
        const reg = new PluginRegistry();
        const global = new Map<string, CustomResolver>([['_global', () => 'G']]);
        const map = buildRoutineResolvers(mkRoutine(), global, reg);
        expect((map.get('_global')!)(undefined, undefined)).toBe('G');
    });

    test('handles undefined registry gracefully', () => {
        const map = buildRoutineResolvers(mkRoutine(), undefined, undefined);
        expect(map.size).toBe(0);
    });

    test('factory-throw warning includes routine name', () => {
        const reg = new PluginRegistry();
        reg.register({
            name: 'boom',
            createRoutineResolvers: () => { throw new Error('no opts given'); },
        });
        let stderrOut = '';
        const orig = process.stderr.write.bind(process.stderr);
        process.stderr.write = ((c: string | Uint8Array) => {
            stderrOut += String(c);

            return true;
        }) as never;

        try {
            buildRoutineResolvers(mkRoutine({ name: 'myroutine' }), undefined, reg);
        } finally {
            process.stderr.write = orig as never;
        }

        expect(stderrOut).toContain('myroutine');
        expect(stderrOut).toContain('boom');
        expect(stderrOut).toContain('no opts given');
    });

    test('stateless plugin resolvers are also merged in', () => {
        const reg = new PluginRegistry();
        reg.register({
            name: 'mixed',
            resolvers: { _mixed_static: () => 'S' },
            createRoutineResolvers: () => ({ _mixed_dynamic: () => 'D' }),
        });
        const map = buildRoutineResolvers(mkRoutine(), undefined, reg);
        expect(map.has('_mixed_static')).toBe(true);
        expect(map.has('_mixed_dynamic')).toBe(true);
    });
});

describe('sub-routine plugin scoping', () => {
    test('sub without plugins: inherits parent map (factory not re-invoked)', () => {
        const reg = new PluginRegistry();
        let factoryCalls = 0;
        reg.register({
            name: 'counter',
            createRoutineResolvers: () => {
                factoryCalls++;
                return { _counter: () => 'X' };
            },
        });
        // Parent routine: factory called once
        const parentMap = buildRoutineResolvers(
            mkRoutine({ name: 'parent', plugins: { counter: {} } }),
            undefined,
            reg,
        );
        expect(factoryCalls).toBe(1);

        // Sub-routine with no plugins: block — dispatcher suppresses registry,
        // so buildRoutineResolvers returns parent's map unchanged (inherit semantics).
        const subMap = buildRoutineResolvers(
            mkRoutine({ name: 'sub' }),
            parentMap,
            undefined,
        );
        expect(factoryCalls).toBe(1);
        expect(subMap.has('_counter')).toBe(true);
    });

    test('sub with plugins: triggers fresh factory call (override semantics)', () => {
        const reg = new PluginRegistry();
        let factoryCalls = 0;
        reg.register({
            name: 'counter',
            createRoutineResolvers: (opts) => {
                factoryCalls++;
                const tag = (opts as { tag?: string }).tag ?? 'default';
                return { _counter: () => tag };
            },
        });
        const parentMap = buildRoutineResolvers(
            mkRoutine({ name: 'parent', plugins: { counter: { tag: 'parent' } } }),
            undefined,
            reg,
        );
        expect(factoryCalls).toBe(1);

        // Sub-routine with its own plugins: block — dispatcher passes the registry,
        // factory is re-invoked with sub's opts. Sub's resolver overrides parent's
        // for its subtree (via Map.set in buildRoutineResolvers).
        const subMap = buildRoutineResolvers(
            mkRoutine({ name: 'sub', plugins: { counter: { tag: 'sub' } } }),
            parentMap,
            reg,
        );
        expect(factoryCalls).toBe(2);
        // Proves the override: parent's closure returns 'parent', sub's returns 'sub'
        expect((parentMap.get('_counter')!)(undefined, undefined)).toBe('parent');
        expect((subMap.get('_counter')!)(undefined, undefined)).toBe('sub');
    });
});
