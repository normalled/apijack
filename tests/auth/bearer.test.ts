import { describe, test, expect, mock } from "bun:test";
import { BearerTokenStrategy } from "../../src/auth/bearer";
import type { ResolvedAuth, AuthSession } from "../../src/auth/types";

describe("BearerTokenStrategy", () => {
  const config: ResolvedAuth = {
    baseUrl: "https://api.example.com",
    username: "admin",
    password: "secret",
  };

  test("constructor takes a getToken function", () => {
    const getToken = mock(async () => "tok_abc123");
    const strategy = new BearerTokenStrategy(getToken);
    expect(strategy).toBeDefined();
  });

  test("authenticate() calls getToken() and returns Bearer header", async () => {
    const getToken = mock(async () => "tok_abc123");
    const strategy = new BearerTokenStrategy(getToken);

    const session = await strategy.authenticate(config);
    expect(getToken).toHaveBeenCalledWith(config);
    expect(session.headers.Authorization).toBe("Bearer tok_abc123");
  });

  test("refresh() calls getToken() again and returns new session", async () => {
    let callCount = 0;
    const getToken = mock(async () => {
      callCount++;
      return `tok_${callCount}`;
    });
    const strategy = new BearerTokenStrategy(getToken);

    const session1 = await strategy.authenticate(config);
    expect(session1.headers.Authorization).toBe("Bearer tok_1");

    const session2 = await strategy.refresh!(session1, config);
    expect(session2.headers.Authorization).toBe("Bearer tok_2");
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  test("restore() returns cached session if not expired", async () => {
    const getToken = mock(async () => "tok_abc123");
    const strategy = new BearerTokenStrategy(getToken);

    const cached: AuthSession = {
      headers: { Authorization: "Bearer tok_abc123" },
      expiresAt: Date.now() + 60_000, // 1 minute in the future
    };
    const result = await strategy.restore(cached, config);
    expect(result).toBe(cached);
  });

  test("restore() returns null if session is expired", async () => {
    const getToken = mock(async () => "tok_abc123");
    const strategy = new BearerTokenStrategy(getToken);

    const cached: AuthSession = {
      headers: { Authorization: "Bearer tok_abc123" },
      expiresAt: Date.now() - 1000, // 1 second in the past
    };
    const result = await strategy.restore(cached, config);
    expect(result).toBeNull();
  });

  test("restore() returns cached session if no expiresAt set", async () => {
    const getToken = mock(async () => "tok_abc123");
    const strategy = new BearerTokenStrategy(getToken);

    const cached: AuthSession = {
      headers: { Authorization: "Bearer tok_abc123" },
    };
    const result = await strategy.restore(cached, config);
    expect(result).toBe(cached);
  });
});
