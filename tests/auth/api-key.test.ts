import { describe, test, expect } from 'bun:test';
import { ApiKeyStrategy } from '../../src/auth/api-key';
import type { ResolvedAuth, AuthSession } from '../../src/auth/types';

describe('ApiKeyStrategy', () => {
    const config: ResolvedAuth = {
        baseUrl: 'https://api.example.com',
        username: 'admin',
        password: 'secret',
    };

    test('constructor takes header name and key value', () => {
        const strategy = new ApiKeyStrategy('X-API-Key', 'my-secret-key');
        expect(strategy).toBeDefined();
    });

    test('authenticate() returns session with the specified header', async () => {
        const strategy = new ApiKeyStrategy('X-API-Key', 'my-secret-key');
        const session = await strategy.authenticate(config);
        expect(session.headers['X-API-Key']).toBe('my-secret-key');
    });

    test('authenticate() works with custom header names', async () => {
        const strategy = new ApiKeyStrategy('Authorization', 'ApiKey sk-12345');
        const session = await strategy.authenticate(config);
        expect(session.headers.Authorization).toBe('ApiKey sk-12345');
    });

    test('restore() always returns the cached session (stateless)', async () => {
        const strategy = new ApiKeyStrategy('X-API-Key', 'my-secret-key');
        const cached: AuthSession = {
            headers: { 'X-API-Key': 'my-secret-key' },
        };
        const result = await strategy.restore(cached, config);
        expect(result).toBe(cached);
    });
});
