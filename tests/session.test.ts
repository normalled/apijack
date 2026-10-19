import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { SessionManager, type SessionBinding } from '../src/session';
import type { AuthStrategy, AuthSession, ResolvedAuth } from '../src/auth/types';

function makeMockStrategy(overrides: Partial<AuthStrategy> = {}): AuthStrategy {
    return {
        authenticate: overrides.authenticate ?? (async config => ({
            headers: { Authorization: 'Bearer fresh-token' },
            expiresAt: Date.now() + 30 * 60 * 1000,
        })),
        restore: overrides.restore ?? (async (cached, config) => cached),
        ...overrides,
    };
}

const config: ResolvedAuth = {
    baseUrl: 'https://api.example.com',
    username: 'user',
    password: 'pass',
};

describe('SessionManager', () => {
    let tmpDir: string;
    let sessionPath: string;
    let manager: SessionManager;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'session-test-'));
        sessionPath = join(tmpDir, 'session.json');
        manager = new SessionManager('test', sessionPath);
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    test('resolve() calls strategy.authenticate() when no cached session', async () => {
        let authenticateCalled = false;
        const strategy = makeMockStrategy({
            authenticate: async (cfg) => {
                authenticateCalled = true;

                return { headers: { Authorization: 'Bearer new' } };
            },
        });

        const session = await manager.resolve(strategy, config);

        expect(authenticateCalled).toBe(true);
        expect(session.headers.Authorization).toBe('Bearer new');
    });

    test('resolve() calls strategy.restore() when cache exists and not expired', async () => {
        let restoreCalled = false;
        let authenticateCalled = false;

        // Pre-populate the cache with a non-expired session
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer cached' },
            expiresAt: Date.now() + 60 * 1000, // 1 minute in the future
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        const strategy = makeMockStrategy({
            authenticate: async () => {
                authenticateCalled = true;

                return { headers: { Authorization: 'Bearer fresh' } };
            },
            restore: async (c, cfg) => {
                restoreCalled = true;

                return c;
            },
        });

        const session = await manager.resolve(strategy, config);

        expect(restoreCalled).toBe(true);
        expect(authenticateCalled).toBe(false);
        expect(session.headers.Authorization).toBe('Bearer cached');
    });

    test('resolve() calls strategy.authenticate() when restore() returns null', async () => {
        let authenticateCalled = false;

        // Pre-populate with a valid (non-expired) cached session
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer stale' },
            expiresAt: Date.now() + 60 * 1000,
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        const strategy = makeMockStrategy({
            authenticate: async () => {
                authenticateCalled = true;

                return { headers: { Authorization: 'Bearer fresh' } };
            },
            restore: async () => null,
        });

        const session = await manager.resolve(strategy, config);

        expect(authenticateCalled).toBe(true);
        expect(session.headers.Authorization).toBe('Bearer fresh');
    });

    test('resolve() calls strategy.refresh() when session is expired and refresh is available', async () => {
        let refreshCalled = false;
        let authenticateCalled = false;

        // Pre-populate with an expired session
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer expired' },
            expiresAt: Date.now() - 1000, // 1 second in the past
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        const strategy = makeMockStrategy({
            authenticate: async () => {
                authenticateCalled = true;

                return { headers: { Authorization: 'Bearer fresh' } };
            },
            refresh: async (sess, cfg) => {
                refreshCalled = true;

                return { headers: { Authorization: 'Bearer refreshed' }, expiresAt: Date.now() + 60000 };
            },
        });

        const session = await manager.resolve(strategy, config);

        expect(refreshCalled).toBe(true);
        expect(authenticateCalled).toBe(false);
        expect(session.headers.Authorization).toBe('Bearer refreshed');
    });

    test('resolve() calls strategy.authenticate() when expired and no refresh method', async () => {
        let authenticateCalled = false;

        // Pre-populate with an expired session
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer expired' },
            expiresAt: Date.now() - 1000,
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        const strategy = makeMockStrategy({
            authenticate: async () => {
                authenticateCalled = true;

                return { headers: { Authorization: 'Bearer fresh' } };
            },
        });
        // Remove refresh so it's undefined
        delete (strategy as any).refresh;

        const session = await manager.resolve(strategy, config);

        expect(authenticateCalled).toBe(true);
        expect(session.headers.Authorization).toBe('Bearer fresh');
    });

    test('invalidate() clears cached session file', async () => {
    // Pre-populate cache
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer cached' },
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        expect(existsSync(sessionPath)).toBe(true);

        manager.invalidate();

        expect(existsSync(sessionPath)).toBe(false);
    });

    test('invalidate() does not throw when no session file exists', () => {
        expect(() => manager.invalidate()).not.toThrow();
    });

    test('session is persisted to disk after resolve', async () => {
        const strategy = makeMockStrategy({
            authenticate: async () => ({
                headers: { Authorization: 'Bearer persisted' },
                expiresAt: 9999999999999,
                data: { role: 'admin' },
            }),
        });

        await manager.resolve(strategy, config);

        expect(existsSync(sessionPath)).toBe(true);
        const saved = JSON.parse(readFileSync(sessionPath, 'utf-8'));
        expect(saved.headers.Authorization).toBe('Bearer persisted');
        expect(saved.expiresAt).toBe(9999999999999);
        expect(saved.data.role).toBe('admin');
    });

    test('default session path uses ~/.cliName/session.json', () => {
        const defaultMgr = new SessionManager('myapp');
        // Access the private sessionPath via any cast
        const path = (defaultMgr as any).sessionPath;
        expect(path).toBe(join(homedir(), '.myapp', 'session.json'));
    });

    test('sessionPathOverride takes precedence over default', () => {
        const customPath = join(tmpDir, 'custom', 'session.json');
        const customMgr = new SessionManager('myapp', customPath);
        const path = (customMgr as any).sessionPath;
        expect(path).toBe(customPath);
    });

    test('resolve() handles cached session with no expiresAt as valid', async () => {
        let restoreCalled = false;

        // Cache a session without expiresAt (never expires)
        const cached: AuthSession = {
            headers: { Authorization: 'Bearer eternal' },
        };
        const { writeFileSync, mkdirSync } = await import('fs');
        const { dirname } = await import('path');
        mkdirSync(dirname(sessionPath), { recursive: true });
        writeFileSync(sessionPath, JSON.stringify(cached));

        const strategy = makeMockStrategy({
            restore: async (c) => {
                restoreCalled = true;

                return c;
            },
        });

        const session = await manager.resolve(strategy, config);

        expect(restoreCalled).toBe(true);
        expect(session.headers.Authorization).toBe('Bearer eternal');
    });
});

describe('SessionManager.forEnvironment (per-environment sessions, #179)', () => {
    let configDir: string;
    let minted: string[];

    const dev: SessionBinding = { env: 'dev', baseUrl: 'http://dev.example.com', username: 'alice' };
    const staging: SessionBinding = { env: 'staging', baseUrl: 'https://staging.example.com', username: 'bob' };

    // Mints a distinguishable session per authenticate() call and restores whatever was cached.
    const strategy: AuthStrategy = {
        authenticate: async (cfg) => {
            minted.push(cfg.username);

            return { headers: { 'X-Mint': `${cfg.username}-${minted.length}` } };
        },
        restore: async cached => cached,
    };

    const authFor = (b: SessionBinding): ResolvedAuth => ({ baseUrl: b.baseUrl, username: b.username, password: 'pw' });

    async function resolveFor(b: SessionBinding): Promise<string> {
        const session = await SessionManager.forEnvironment(configDir, b).resolve(strategy, authFor(b));

        return session.headers['X-Mint']!;
    }

    beforeEach(() => {
        configDir = mkdtempSync(join(tmpdir(), 'session-env-test-'));
        minted = [];
    });

    afterEach(() => {
        rmSync(configDir, { recursive: true, force: true });
    });

    test('persists the session under sessions/<env>.json, recording env, baseUrl and username', async () => {
        await resolveFor(dev);

        const file = JSON.parse(readFileSync(join(configDir, 'sessions', 'dev.json'), 'utf-8'));
        expect(file).toMatchObject({ env: 'dev', baseUrl: 'http://dev.example.com', username: 'alice' });
        expect(JSON.stringify(file)).toContain('alice-1');
    });

    test('each environment keeps its own session', async () => {
        expect(await resolveFor(dev)).toBe('alice-1');
        expect(await resolveFor(staging)).toBe('bob-2');
        expect(await resolveFor(dev)).toBe('alice-1');
        expect(await resolveFor(staging)).toBe('bob-2');
        expect(minted).toEqual(['alice', 'bob']);
    });

    test('a cached session minted for a different baseUrl is not reused', async () => {
        await resolveFor(dev);

        const moved = { ...dev, baseUrl: 'http://elsewhere.example.com' };
        expect(await resolveFor(moved)).toBe('alice-2');
    });

    test('a cached session minted for a different username is not reused', async () => {
        await resolveFor(dev);

        const otherUser = { ...dev, username: 'carol' };
        expect(await resolveFor(otherUser)).toBe('carol-2');
    });

    test('a session file recorded for another environment is not reused', async () => {
        // Case-insensitive filesystems put "Dev" and "dev" in one file.
        await resolveFor({ ...dev, env: 'Dev' });
        const file = JSON.parse(readFileSync(join(configDir, 'sessions', 'Dev.json'), 'utf-8'));
        writeFileSync(join(configDir, 'sessions', 'dev.json'), JSON.stringify(file));

        expect(await resolveFor(dev)).toBe('alice-2');
    });

    test('ignores the legacy <configDir>/session.json and leaves it in place', async () => {
        const legacy = JSON.stringify({ headers: { 'X-Mint': 'legacy' } });
        writeFileSync(join(configDir, 'session.json'), legacy);

        expect(await resolveFor(dev)).toBe('alice-1');
        expect(readFileSync(join(configDir, 'session.json'), 'utf-8')).toBe(legacy);
    });

    test('environment names cannot escape sessions/ or collide with each other', async () => {
        const names = ['../escape', 'a/b', 'a\\b', 'a%2Fb', '..', '.'];

        for (const env of names) {
            await resolveFor({ ...dev, env });
        }

        expect(readdirSync(configDir)).toEqual(['sessions']);
        const files = readdirSync(join(configDir, 'sessions')).filter(f => f !== '.gitignore');
        expect(files).toHaveLength(names.length);

        // Every name still resolves to its own cached session.
        for (const [i, env] of names.entries()) {
            expect(await resolveFor({ ...dev, env })).toBe(`alice-${i + 1}`);
        }
    });

    test('session filenames are valid on Windows', async () => {
        const names = ['a*b', 'x:y', 'what?', 'pipe|d', '<tag>', 'say"hi"', 'con', 'NUL', 'com1', 'Lpt9'];

        for (const env of names) {
            await resolveFor({ ...dev, env });
        }

        const files = readdirSync(join(configDir, 'sessions')).filter(f => f !== '.gitignore');
        expect(files).toHaveLength(names.length);

        for (const file of files) {
            expect(file).not.toMatch(/[<>:"/\\|?*]/);
            expect(file.split('.')[0]!).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)$/i);
        }
    });

    test('env-var credentials (env: null) get a session no config environment can claim', async () => {
        const fromEnvVars: SessionBinding = { env: null, baseUrl: dev.baseUrl, username: dev.username };

        expect(await resolveFor(fromEnvVars)).toBe('alice-1');

        for (const env of ['@env-vars', 'env-vars', 'null', '_env']) {
            await resolveFor({ ...dev, env });
        }

        expect(await resolveFor(fromEnvVars)).toBe('alice-1');
    });

    test('sessions/.gitignore keeps every session file out of git', async () => {
        const projectRoot = join(configDir, 'project');
        const apijackDir = join(projectRoot, '.apijack');
        expect(Bun.spawnSync(['git', 'init', '-q', projectRoot]).exitCode).toBe(0);

        await SessionManager.forEnvironment(apijackDir, dev).resolve(strategy, authFor(dev));
        await SessionManager.forEnvironment(apijackDir, { env: null, baseUrl: dev.baseUrl, username: 'x' })
            .resolve(strategy, { ...authFor(dev), username: 'x' });

        expect(readdirSync(join(apijackDir, 'sessions')).length).toBeGreaterThan(1);
        const status = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: projectRoot });
        expect(status.exitCode).toBe(0);
        expect(status.stdout.toString()).toBe('');
    });

    test.skipIf(process.platform === 'win32')('sessions/ and its files are readable only by the owner', async () => {
        await resolveFor(dev);

        expect(statSync(join(configDir, 'sessions')).mode & 0o777).toBe(0o700);
        expect(statSync(join(configDir, 'sessions', 'dev.json')).mode & 0o777).toBe(0o600);
    });

    test('invalidate() removes only that environment\'s session', async () => {
        await resolveFor(dev);
        await resolveFor(staging);

        SessionManager.forEnvironment(configDir, dev).invalidate();

        expect(await resolveFor(staging)).toBe('bob-2');
        expect(await resolveFor(dev)).toBe('alice-3');
    });

    test('clear() removes one environment\'s session and reports whether one existed', async () => {
        await resolveFor(dev);
        await resolveFor(staging);

        expect(SessionManager.clear(configDir, 'staging')).toBe(true);
        expect(SessionManager.clear(configDir, 'staging')).toBe(false);

        expect(await resolveFor(dev)).toBe('alice-1');
        expect(await resolveFor(staging)).toBe('bob-3');
    });

    test('clearAll() removes every environment\'s session and reports whether any existed', async () => {
        await resolveFor(dev);
        await resolveFor(staging);

        expect(SessionManager.clearAll(configDir)).toBe(true);
        expect(SessionManager.clearAll(configDir)).toBe(false);

        expect(await resolveFor(dev)).toBe('alice-3');
        expect(await resolveFor(staging)).toBe('bob-4');
    });
});
