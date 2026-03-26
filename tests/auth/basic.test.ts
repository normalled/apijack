import { describe, test, expect } from "bun:test";
import { BasicAuthStrategy } from "../../src/auth/basic";
import type { ResolvedAuth, AuthSession } from "../../src/auth/types";

describe("BasicAuthStrategy", () => {
  const config: ResolvedAuth = {
    baseUrl: "https://api.example.com",
    username: "admin",
    password: "secret",
  };

  const strategy = new BasicAuthStrategy();

  test("authenticate() returns session with Authorization Basic header", async () => {
    const session = await strategy.authenticate(config);
    const expected = "Basic " + btoa("admin:secret");
    expect(session.headers.Authorization).toBe(expected);
  });

  test("authenticate() does not set expiresAt", async () => {
    const session = await strategy.authenticate(config);
    expect(session.expiresAt).toBeUndefined();
  });

  test("restore() always returns the cached session (stateless)", async () => {
    const cached: AuthSession = {
      headers: { Authorization: "Basic dGVzdDp0ZXN0" },
    };
    const result = await strategy.restore(cached, config);
    expect(result).toBe(cached);
  });
});
