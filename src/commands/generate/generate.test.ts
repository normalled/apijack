import { describe, test, expect, mock } from 'bun:test';
import { generateAction } from './generate';
import type { AuthStrategy, AuthSession } from '../../auth/types';
import type { SessionManager } from '../../session';

describe('generateAction', () => {
    test('calls fetchSpec and generate with correct params', async () => {
        const fetchSpec = mock(() => Promise.resolve({ paths: {} } as unknown));
        const generate = mock(() => Promise.resolve());

        await generateAction({
            env: { url: 'http://localhost:8080', user: 'admin', password: 'secret' },
            specPath: '/v3/api-docs',
            outDir: '/tmp/generated',
            fetchSpec,
            generate,
        });

        expect(fetchSpec).toHaveBeenCalledWith({
            baseUrl: 'http://localhost:8080',
            specPath: '/v3/api-docs',
            auth: { username: 'admin', password: 'secret' },
            strategy: undefined,
            sessionManager: undefined,
        });
        expect(generate).toHaveBeenCalledWith({
            spec: { paths: {} },
            outDir: '/tmp/generated',
        });
    });

    test('threads strategy and sessionManager through to fetchSpec', async () => {
        const strategy = {} as AuthStrategy;
        const sessionManager = {
            resolve: mock(() => Promise.resolve({ headers: {} } as AuthSession)),
            invalidate: mock(() => {}),
        } as unknown as SessionManager;
        const fetchSpec = mock(() => Promise.resolve({ paths: {} } as unknown));
        const generate = mock(() => Promise.resolve());

        await generateAction({
            env: { url: 'http://localhost:8080', user: 'admin', password: 'secret' },
            specPath: '/v3/api-docs',
            outDir: '/tmp/generated',
            strategy,
            sessionManager,
            fetchSpec,
            generate,
        });

        const [opts] = fetchSpec.mock.calls[0] as unknown as [Record<string, unknown>];
        expect(opts.strategy).toBe(strategy);
        expect(opts.sessionManager).toBe(sessionManager);
    });

    test('throws when no active environment', () => {
        expect(generateAction({
            env: null,
            specPath: '/v3/api-docs',
            outDir: '/tmp/generated',
            fetchSpec: mock(() => Promise.resolve({})),
            generate: mock(() => Promise.resolve()),
        })).rejects.toThrow('No active environment');
    });
});
