import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { fetchSpec } from './index';
import type { AuthStrategy, AuthSession } from '../auth/types';
import type { SessionManager } from '../session';

const stubResponse = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status });

describe('fetchSpec', () => {
    const originalFetch = globalThis.fetch;
    let fetchMock: ReturnType<typeof mock>;

    beforeEach(() => {
        fetchMock = mock(() => Promise.resolve(stubResponse(200, { paths: {} })));
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('uses Basic auth when no strategy is provided', async () => {
        await fetchSpec({
            baseUrl: 'http://localhost:8080',
            specPath: '/v3/api-docs',
            auth: { username: 'admin', password: 'secret' },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://localhost:8080/v3/api-docs');
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe(
            'Basic ' + btoa('admin:secret'),
        );
        expect(headers.Accept).toBe('application/json');
    });

    test('uses session headers from strategy when provided', async () => {
        const session: AuthSession = {
            headers: { Cookie: 'JSESSIONID=abc; X-XSRF=xyz' },
        };
        const sessionManager = {
            resolve: mock(() => Promise.resolve(session)),
            invalidate: mock(() => {}),
        } as unknown as SessionManager;
        const strategy = {} as AuthStrategy;

        await fetchSpec({
            baseUrl: 'http://localhost:8080',
            specPath: '/v3/api-docs',
            auth: { username: 'admin', password: 'secret' },
            strategy,
            sessionManager,
        });

        expect(sessionManager.resolve).toHaveBeenCalledWith(strategy, {
            baseUrl: 'http://localhost:8080',
            username: 'admin',
            password: 'secret',
        });
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers.Cookie).toBe('JSESSIONID=abc; X-XSRF=xyz');
        expect(headers.Authorization).toBeUndefined();
    });

    test('on 401, invalidates session and retries once', async () => {
        const session: AuthSession = { headers: { Cookie: 'fresh' } };
        const resolve = mock(() => Promise.resolve(session));
        const invalidate = mock(() => {});
        const sessionManager = { resolve, invalidate } as unknown as SessionManager;
        const strategy = {} as AuthStrategy;

        let callCount = 0;
        fetchMock = mock(() => {
            callCount++;

            return Promise.resolve(
                callCount === 1
                    ? stubResponse(401, {})
                    : stubResponse(200, { paths: {} }),
            );
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const spec = await fetchSpec({
            baseUrl: 'http://localhost:8080',
            specPath: '/v3/api-docs',
            auth: { username: 'admin', password: 'secret' },
            strategy,
            sessionManager,
        });

        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(spec).toEqual({ paths: {} });
    });

    test('throws when retry after 401 still fails', async () => {
        const sessionManager = {
            resolve: mock(() => Promise.resolve({ headers: {} } as AuthSession)),
            invalidate: mock(() => {}),
        } as unknown as SessionManager;
        const strategy = {} as AuthStrategy;

        fetchMock = mock(() => Promise.resolve(stubResponse(401, {})));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(
            fetchSpec({
                baseUrl: 'http://localhost:8080',
                specPath: '/v3/api-docs',
                auth: { username: 'admin', password: 'secret' },
                strategy,
                sessionManager,
            }),
        ).rejects.toThrow(/401/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sessionManager.invalidate).toHaveBeenCalledTimes(1);
    });

    test('does not retry on 401 when no strategy is provided', async () => {
        fetchMock = mock(() => Promise.resolve(stubResponse(401, {})));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(
            fetchSpec({
                baseUrl: 'http://localhost:8080',
                specPath: '/v3/api-docs',
                auth: { username: 'admin', password: 'secret' },
            }),
        ).rejects.toThrow(/401/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
