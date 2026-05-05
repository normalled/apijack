import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateClient } from '../../src/codegen/client';
import { SessionManager } from '../../src/session';
import { SessionAuthStrategy } from '../../src/auth/session-auth';
import { BasicAuthStrategy } from '../../src/auth/basic';
import { resolveRequestHeaders } from '../../src/auth/resolve-headers';
import type { OpenApiOperation } from '../../src/codegen/openapi-types';
import type { SessionAuthConfig, AuthSession, ResolvedAuth } from '../../src/auth/types';

/**
 * Integration test for stale-session refresh + retry (#77).
 *
 * Exercises the full pipeline that recovers from a server-side session timeout:
 *   cached session loaded → API call → 401 → /session re-bootstrap → retry → 200
 *
 * This is the contract documented in CLAUDE.md under "Stale-session refresh and
 * retry": a consumer opts in by setting `refreshOn` on `SessionAuthConfig`, and
 * the generated client + cli-builder wiring transparently refresh and retry
 * once on the configured statuses.
 */
describe('SessionAuthStrategy stale-session refresh + retry (integration)', () => {
    let tmpDir: string;
    let sessionPath: string;
    let originalFetch: typeof globalThis.fetch;

    const baseUrl = 'https://api.example.com';
    const resolved: ResolvedAuth = { baseUrl, username: 'user', password: 'pass' };
    const sessionConfig: SessionAuthConfig = {
        session: { endpoint: '/session' },
        cookies: { extract: ['SESSION'], applyTo: ['DELETE'] },
        refreshOn: [401],
    };

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'apijack-stale-retry-'));
        sessionPath = join(tmpDir, 'session.json');
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        rmSync(tmpDir, { recursive: true, force: true });
    });

    test('on 401, refreshes /session exactly once and retries the original request successfully', async () => {
        // 1. Pre-populate session.json with a cached (server-side stale) session.
        writeFileSync(sessionPath, JSON.stringify({
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
            cookies: { SESSION: 'stale-sess' },
        }));

        // 2. Generate a real ApiClient with one DELETE method, write to tmp, dynamic-import.
        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/admin/matters/{id}': {
                delete: {
                    operationId: 'deleteMatter',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                },
            },
        };
        const clientPath = join(tmpDir, 'client.ts');
        writeFileSync(clientPath, generateClient(paths));
        const { ApiClient } = await import(clientPath) as { ApiClient: new (
            baseUrl: string,
            getHeaders: (method: string) => Record<string, string>,
            onRefreshNeeded?: () => Promise<void>,
            refreshOn?: number[],
        ) => { deleteMatter(id: number): Promise<unknown> }; };

        // 3. Mock fetch:
        //    - DELETE #1 (with stale cookie) -> 401
        //    - GET /session (refresh)        -> 200 with fresh SESSION cookie
        //    - DELETE #2 (with fresh cookie) -> 200
        const calls: { url: string; method: string; cookieHeader: string | undefined }[] = [];
        let deleteCount = 0;
        let sessionCount = 0;

        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string'
                ? url
                : url instanceof URL ? url.toString() : url.url;
            const method = (init?.method ?? 'GET').toUpperCase();
            const headers = init?.headers as Record<string, string> | undefined;
            calls.push({ url: urlStr, method, cookieHeader: headers?.Cookie });

            if (urlStr.endsWith('/session')) {
                sessionCount++;

                return new Response('{}', {
                    status: 200,
                    headers: [['Set-Cookie', `SESSION=fresh-sess-${sessionCount}; Path=/; HttpOnly`]],
                });
            }

            if (urlStr.includes('/admin/matters/5') && method === 'DELETE') {
                deleteCount++;

                if (deleteCount === 1) {
                    return new Response(
                        JSON.stringify({ status: 403, error: 'Forbidden', path: '/admin/matters/5' }),
                        { status: 401 },
                    );
                }

                return new Response(JSON.stringify({ ok: true, id: 5 }), { status: 200 });
            }

            return new Response('not found', { status: 404 });
        }) as typeof fetch;

        // 4. Wire SessionManager + SessionAuthStrategy exactly as cli-builder does.
        const sessionMgr = new SessionManager('test', sessionPath);
        const strategy = new SessionAuthStrategy(new BasicAuthStrategy(), sessionConfig);

        let session: AuthSession | null = null;
        const getHeaders = (method: string) =>
            resolveRequestHeaders(session ?? { headers: {} }, sessionConfig, method);
        const refreshSession = async () => {
            sessionMgr.invalidate();
            session = await sessionMgr.resolve(strategy, resolved);
        };

        // 5. Initial resolve loads the cached session — does NOT hit /session yet.
        session = await sessionMgr.resolve(strategy, resolved);
        expect(session.cookies?.SESSION).toBe('stale-sess');
        expect(sessionCount).toBe(0);

        const client = new ApiClient(baseUrl, getHeaders, refreshSession, sessionConfig.refreshOn);

        // 6. Make the request — 401 triggers refresh, retry succeeds.
        const result = await client.deleteMatter(5);
        expect(result).toEqual({ ok: true, id: 5 });

        // 7. /session called exactly once (during refresh).
        expect(sessionCount).toBe(1);

        // 8. The DELETE was made twice; the retry shipped the refreshed cookie.
        const deletes = calls.filter(c => c.method === 'DELETE');
        expect(deletes).toHaveLength(2);
        expect(deletes[0].cookieHeader).toContain('SESSION=stale-sess');
        expect(deletes[1].cookieHeader).toContain('SESSION=fresh-sess-1');
    });

    test('when refreshOn is unset, a 401 propagates without refresh or retry (opt-in)', async () => {
        // Same setup as the happy-path test, but no refreshOn on the config — the
        // contract is opt-in, so the 401 should surface untouched.
        writeFileSync(sessionPath, JSON.stringify({
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
            cookies: { SESSION: 'stale-sess' },
        }));

        const optInConfig: SessionAuthConfig = {
            session: { endpoint: '/session' },
            cookies: { extract: ['SESSION'], applyTo: ['DELETE'] },
            // refreshOn intentionally omitted
        };

        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/admin/matters/{id}': {
                delete: {
                    operationId: 'deleteMatter',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                },
            },
        };
        const clientPath = join(tmpDir, 'client.ts');
        writeFileSync(clientPath, generateClient(paths));
        const { ApiClient } = await import(clientPath) as { ApiClient: new (
            baseUrl: string,
            getHeaders: (method: string) => Record<string, string>,
            onRefreshNeeded?: () => Promise<void>,
            refreshOn?: number[],
        ) => { deleteMatter(id: number): Promise<unknown> }; };

        let deleteCount = 0;
        let sessionCount = 0;
        globalThis.fetch = (async (url: string | URL | Request) => {
            const urlStr = typeof url === 'string'
                ? url
                : url instanceof URL ? url.toString() : url.url;

            if (urlStr.endsWith('/session')) {
                sessionCount++;

                return new Response('{}', { status: 200, headers: [['Set-Cookie', 'SESSION=fresh; Path=/']] });
            }

            if (urlStr.includes('/admin/matters/5')) {
                deleteCount++;

                return new Response('Forbidden', { status: 401 });
            }

            return new Response('not found', { status: 404 });
        }) as typeof fetch;

        const sessionMgr = new SessionManager('test', sessionPath);
        const strategy = new SessionAuthStrategy(new BasicAuthStrategy(), optInConfig);
        let session: AuthSession | null = await sessionMgr.resolve(strategy, resolved);
        const getHeaders = (method: string) =>
            resolveRequestHeaders(session ?? { headers: {} }, optInConfig, method);
        const refreshSession = async () => {
            sessionMgr.invalidate();
            session = await sessionMgr.resolve(strategy, resolved);
        };

        const client = new ApiClient(baseUrl, getHeaders, refreshSession, optInConfig.refreshOn);

        await expect(client.deleteMatter(5)).rejects.toMatchObject({ status: 401 });

        // No refresh attempted, no retry made.
        expect(sessionCount).toBe(0);
        expect(deleteCount).toBe(1);
    });

    test('when refresh callback throws, original 401 is preserved with refresh error as cause (#98)', async () => {
        // Pre-populate session.json with a cached (server-side stale) session.
        writeFileSync(sessionPath, JSON.stringify({
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
            cookies: { SESSION: 'stale-sess' },
        }));

        const paths: Record<string, Record<string, OpenApiOperation>> = {
            '/admin/matters/{id}': {
                delete: {
                    operationId: 'deleteMatter',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                },
            },
        };
        const clientPath = join(tmpDir, 'client.ts');
        writeFileSync(clientPath, generateClient(paths));
        const { ApiClient } = await import(clientPath) as { ApiClient: new (
            baseUrl: string,
            getHeaders: (method: string) => Record<string, string>,
            onRefreshNeeded?: () => Promise<void>,
            refreshOn?: number[],
        ) => { deleteMatter(id: number): Promise<unknown> }; };

        // Mock fetch:
        //  - DELETE -> 401 with a structured error body
        //  - /session would normally be hit by the refresh, but our refresh callback
        //    throws before getting that far.
        const originalErrorBody = JSON.stringify({ status: 401, error: 'Unauthorized', path: '/admin/matters/5' });
        let deleteCount = 0;

        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string'
                ? url
                : url instanceof URL ? url.toString() : url.url;
            const method = (init?.method ?? 'GET').toUpperCase();

            if (urlStr.includes('/admin/matters/5') && method === 'DELETE') {
                deleteCount++;

                return new Response(originalErrorBody, { status: 401 });
            }

            return new Response('not found', { status: 404 });
        }) as typeof fetch;

        // Refresh callback that always fails — simulates creds being rotated /
        // /session returning 5xx, etc.
        const refreshFailure = new Error('refresh failed: credentials no longer valid');
        const refreshSession = async () => {
            throw refreshFailure;
        };

        const sessionMgr = new SessionManager('test', sessionPath);
        const strategy = new SessionAuthStrategy(new BasicAuthStrategy(), sessionConfig);
        const session: AuthSession = await sessionMgr.resolve(strategy, resolved);
        const getHeaders = (method: string) =>
            resolveRequestHeaders(session, sessionConfig, method);

        const client = new ApiClient(baseUrl, getHeaders, refreshSession, sessionConfig.refreshOn);

        // Capture the thrown error and assert original {status, body} survived.
        let thrown: unknown;
        try {
            await client.deleteMatter(5);
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(Error);
        const err = thrown as Error & { status?: number; body?: string; cause?: unknown };
        expect(err.status).toBe(401);
        expect(err.body).toBe(originalErrorBody);
        expect(err.cause).toBe(refreshFailure);

        // Original request was made once; no retry attempted because refresh failed.
        expect(deleteCount).toBe(1);
    });
});
