import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionManager } from "../src/session";
import type { AuthStrategy, AuthSession, ResolvedAuth } from "../src/auth/types";

function makeMockStrategy(overrides: Partial<AuthStrategy> = {}): AuthStrategy {
  return {
    authenticate: overrides.authenticate ?? (async (config) => ({
      headers: { Authorization: "Bearer fresh-token" },
      expiresAt: Date.now() + 30 * 60 * 1000,
    })),
    restore: overrides.restore ?? (async (cached, config) => cached),
    ...overrides,
  };
}

const config: ResolvedAuth = {
  baseUrl: "https://api.example.com",
  username: "user",
  password: "pass",
};

describe("SessionManager", () => {
  let tmpDir: string;
  let sessionPath: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-test-"));
    sessionPath = join(tmpDir, "session.json");
    manager = new SessionManager("test", sessionPath);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("resolve() calls strategy.authenticate() when no cached session", async () => {
    let authenticateCalled = false;
    const strategy = makeMockStrategy({
      authenticate: async (cfg) => {
        authenticateCalled = true;
        return { headers: { Authorization: "Bearer new" } };
      },
    });

    const session = await manager.resolve(strategy, config);

    expect(authenticateCalled).toBe(true);
    expect(session.headers.Authorization).toBe("Bearer new");
  });

  test("resolve() calls strategy.restore() when cache exists and not expired", async () => {
    let restoreCalled = false;
    let authenticateCalled = false;

    // Pre-populate the cache with a non-expired session
    const cached: AuthSession = {
      headers: { Authorization: "Bearer cached" },
      expiresAt: Date.now() + 60 * 1000, // 1 minute in the future
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(cached));

    const strategy = makeMockStrategy({
      authenticate: async () => {
        authenticateCalled = true;
        return { headers: { Authorization: "Bearer fresh" } };
      },
      restore: async (c, cfg) => {
        restoreCalled = true;
        return c;
      },
    });

    const session = await manager.resolve(strategy, config);

    expect(restoreCalled).toBe(true);
    expect(authenticateCalled).toBe(false);
    expect(session.headers.Authorization).toBe("Bearer cached");
  });

  test("resolve() calls strategy.authenticate() when restore() returns null", async () => {
    let authenticateCalled = false;

    // Pre-populate with a valid (non-expired) cached session
    const cached: AuthSession = {
      headers: { Authorization: "Bearer stale" },
      expiresAt: Date.now() + 60 * 1000,
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(cached));

    const strategy = makeMockStrategy({
      authenticate: async () => {
        authenticateCalled = true;
        return { headers: { Authorization: "Bearer fresh" } };
      },
      restore: async () => null,
    });

    const session = await manager.resolve(strategy, config);

    expect(authenticateCalled).toBe(true);
    expect(session.headers.Authorization).toBe("Bearer fresh");
  });

  test("resolve() calls strategy.refresh() when session is expired and refresh is available", async () => {
    let refreshCalled = false;
    let authenticateCalled = false;

    // Pre-populate with an expired session
    const cached: AuthSession = {
      headers: { Authorization: "Bearer expired" },
      expiresAt: Date.now() - 1000, // 1 second in the past
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(cached));

    const strategy = makeMockStrategy({
      authenticate: async () => {
        authenticateCalled = true;
        return { headers: { Authorization: "Bearer fresh" } };
      },
      refresh: async (sess, cfg) => {
        refreshCalled = true;
        return { headers: { Authorization: "Bearer refreshed" }, expiresAt: Date.now() + 60000 };
      },
    });

    const session = await manager.resolve(strategy, config);

    expect(refreshCalled).toBe(true);
    expect(authenticateCalled).toBe(false);
    expect(session.headers.Authorization).toBe("Bearer refreshed");
  });

  test("resolve() calls strategy.authenticate() when expired and no refresh method", async () => {
    let authenticateCalled = false;

    // Pre-populate with an expired session
    const cached: AuthSession = {
      headers: { Authorization: "Bearer expired" },
      expiresAt: Date.now() - 1000,
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(cached));

    const strategy = makeMockStrategy({
      authenticate: async () => {
        authenticateCalled = true;
        return { headers: { Authorization: "Bearer fresh" } };
      },
    });
    // Remove refresh so it's undefined
    delete (strategy as any).refresh;

    const session = await manager.resolve(strategy, config);

    expect(authenticateCalled).toBe(true);
    expect(session.headers.Authorization).toBe("Bearer fresh");
  });

  test("invalidate() clears cached session file", async () => {
    // Pre-populate cache
    const cached: AuthSession = {
      headers: { Authorization: "Bearer cached" },
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(sessionPath), { recursive: true });
    writeFileSync(sessionPath, JSON.stringify(cached));

    expect(existsSync(sessionPath)).toBe(true);

    manager.invalidate();

    expect(existsSync(sessionPath)).toBe(false);
  });

  test("invalidate() does not throw when no session file exists", () => {
    expect(() => manager.invalidate()).not.toThrow();
  });

  test("session is persisted to disk after resolve", async () => {
    const strategy = makeMockStrategy({
      authenticate: async () => ({
        headers: { Authorization: "Bearer persisted" },
        expiresAt: 9999999999999,
        data: { role: "admin" },
      }),
    });

    await manager.resolve(strategy, config);

    expect(existsSync(sessionPath)).toBe(true);
    const saved = JSON.parse(readFileSync(sessionPath, "utf-8"));
    expect(saved.headers.Authorization).toBe("Bearer persisted");
    expect(saved.expiresAt).toBe(9999999999999);
    expect(saved.data.role).toBe("admin");
  });

  test("resolve() handles cached session with no expiresAt as valid", async () => {
    let restoreCalled = false;

    // Cache a session without expiresAt (never expires)
    const cached: AuthSession = {
      headers: { Authorization: "Bearer eternal" },
    };
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
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
    expect(session.headers.Authorization).toBe("Bearer eternal");
  });
});
