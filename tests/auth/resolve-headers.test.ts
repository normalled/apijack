import { describe, test, expect } from 'bun:test';
import { resolveRequestHeaders } from '../../src/auth/resolve-headers';
import type { AuthSession, SessionAuthConfig } from '../../src/auth/types';

const baseSession: AuthSession = {
    headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
};

const sessionWithCookies: AuthSession = {
    headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
    cookies: { 'SESSION': 'abc123', 'XSRF-TOKEN': 'xyz789' },
};

const config: SessionAuthConfig = {
    session: { endpoint: '/session' },
    cookies: {
        extract: ['SESSION', 'XSRF-TOKEN'],
        applyTo: ['POST', 'PUT', 'DELETE', 'PATCH'],
    },
    headerMirror: [
        { fromCookie: 'XSRF-TOKEN', toHeader: 'X-XSRF-TOKEN' },
    ],
    refreshOn: [401, 403],
};

describe('resolveRequestHeaders', () => {
    test('returns only base headers when no config', () => {
        const result = resolveRequestHeaders(baseSession, undefined, 'GET');
        expect(result).toEqual({ Authorization: 'Basic dGVzdDp0ZXN0' });
    });

    test('returns only base headers when session has no cookies', () => {
        const result = resolveRequestHeaders(baseSession, config, 'POST');
        expect(result).toEqual({ Authorization: 'Basic dGVzdDp0ZXN0' });
    });

    test('returns only base headers for GET (not in applyTo)', () => {
        const result = resolveRequestHeaders(sessionWithCookies, config, 'GET');
        expect(result).toEqual({ Authorization: 'Basic dGVzdDp0ZXN0' });
        expect(result.Cookie).toBeUndefined();
        expect(result['X-XSRF-TOKEN']).toBeUndefined();
    });

    test('assembles Cookie header and mirrors for POST', () => {
        const result = resolveRequestHeaders(sessionWithCookies, config, 'POST');
        expect(result.Authorization).toBe('Basic dGVzdDp0ZXN0');
        expect(result.Cookie).toBe('SESSION=abc123; XSRF-TOKEN=xyz789');
        expect(result['X-XSRF-TOKEN']).toBe('xyz789');
    });

    test('assembles Cookie header and mirrors for DELETE', () => {
        const result = resolveRequestHeaders(sessionWithCookies, config, 'DELETE');
        expect(result.Cookie).toBe('SESSION=abc123; XSRF-TOKEN=xyz789');
        expect(result['X-XSRF-TOKEN']).toBe('xyz789');
    });

    test('method matching is case-insensitive', () => {
        const result = resolveRequestHeaders(sessionWithCookies, config, 'post');
        expect(result.Cookie).toBe('SESSION=abc123; XSRF-TOKEN=xyz789');
    });

    test('wildcard applyTo matches all methods', () => {
        const wildcardConfig: SessionAuthConfig = {
            ...config,
            cookies: { extract: ['SESSION'], applyTo: ['*'] },
        };
        const result = resolveRequestHeaders(sessionWithCookies, wildcardConfig, 'GET');
        expect(result.Cookie).toBe('SESSION=abc123; XSRF-TOKEN=xyz789');
    });

    test('omitted applyTo defaults to all methods', () => {
        const noScopeConfig: SessionAuthConfig = {
            ...config,
            cookies: { extract: ['SESSION'] },
        };
        const result = resolveRequestHeaders(sessionWithCookies, noScopeConfig, 'GET');
        expect(result.Cookie).toBeDefined();
    });

    test('headerMirror with narrower applyTo than cookies', () => {
        const narrowMirrorConfig: SessionAuthConfig = {
            ...config,
            cookies: {
                extract: ['SESSION', 'XSRF-TOKEN'],
                applyTo: ['POST', 'PUT', 'DELETE'],
            },
            headerMirror: [
                { fromCookie: 'XSRF-TOKEN', toHeader: 'X-XSRF-TOKEN', applyTo: ['POST'] },
            ],
        };
        const deleteResult = resolveRequestHeaders(sessionWithCookies, narrowMirrorConfig, 'DELETE');
        expect(deleteResult.Cookie).toBeDefined();
        expect(deleteResult['X-XSRF-TOKEN']).toBeUndefined();

        const postResult = resolveRequestHeaders(sessionWithCookies, narrowMirrorConfig, 'POST');
        expect(postResult.Cookie).toBeDefined();
        expect(postResult['X-XSRF-TOKEN']).toBe('xyz789');
    });

    test('mirror cannot widen beyond cookie scope', () => {
        const widenAttemptConfig: SessionAuthConfig = {
            ...config,
            cookies: {
                extract: ['SESSION', 'XSRF-TOKEN'],
                applyTo: ['POST'],
            },
            headerMirror: [
                { fromCookie: 'XSRF-TOKEN', toHeader: 'X-XSRF-TOKEN', applyTo: ['GET', 'POST'] },
            ],
        };
        const result = resolveRequestHeaders(sessionWithCookies, widenAttemptConfig, 'GET');
        expect(result['X-XSRF-TOKEN']).toBeUndefined();
        expect(result.Cookie).toBeUndefined();
    });

    test('empty cookies map produces no Cookie header', () => {
        const emptySession: AuthSession = {
            headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
            cookies: {},
        };
        const result = resolveRequestHeaders(emptySession, config, 'POST');
        expect(result.Cookie).toBeUndefined();
        expect(result.Authorization).toBe('Basic dGVzdDp0ZXN0');
    });

    test('does not mutate the original session headers', () => {
        const original = { ...sessionWithCookies.headers };
        resolveRequestHeaders(sessionWithCookies, config, 'POST');
        expect(sessionWithCookies.headers).toEqual(original);
    });
});
