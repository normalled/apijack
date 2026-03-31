import { describe, test, expect } from "bun:test";
import { deepMergeSessionAuth } from "../../src/auth/config-merge";
import type { SessionAuthConfig } from "../../src/auth/types";

const base: SessionAuthConfig = {
  session: { endpoint: "/session", method: "GET" },
  cookies: {
    extract: ["SESSION", "XSRF-TOKEN"],
    applyTo: ["POST", "PUT", "DELETE", "PATCH"],
  },
  headerMirror: [
    { fromCookie: "XSRF-TOKEN", toHeader: "X-XSRF-TOKEN" },
  ],
  refreshOn: [401, 403],
};

describe("deepMergeSessionAuth", () => {
  test("returns base when override is undefined", () => {
    const result = deepMergeSessionAuth(base, undefined);
    expect(result).toEqual(base);
  });

  test("returns base when override is null-ish", () => {
    const result = deepMergeSessionAuth(base, undefined);
    expect(result.session.endpoint).toBe("/session");
  });

  test("overrides scalar fields", () => {
    const override = { session: { endpoint: "/auth/session" } };
    const result = deepMergeSessionAuth(base, override);
    expect(result.session.endpoint).toBe("/auth/session");
    expect(result.session.method).toBe("GET");
  });

  test("replaces arrays entirely (does not concat)", () => {
    const override = { cookies: { applyTo: ["*"] } };
    const result = deepMergeSessionAuth(base, override);
    expect(result.cookies.applyTo).toEqual(["*"]);
    expect(result.cookies.extract).toEqual(["SESSION", "XSRF-TOKEN"]);
  });

  test("overrides refreshOn array", () => {
    const override = { refreshOn: [401] };
    const result = deepMergeSessionAuth(base, override);
    expect(result.refreshOn).toEqual([401]);
  });

  test("overrides headerMirror array", () => {
    const override = {
      headerMirror: [
        { fromCookie: "CSRF", toHeader: "X-CSRF" },
      ],
    };
    const result = deepMergeSessionAuth(base, override);
    expect(result.headerMirror).toEqual([
      { fromCookie: "CSRF", toHeader: "X-CSRF" },
    ]);
  });

  test("does not mutate base config", () => {
    const baseCopy = JSON.parse(JSON.stringify(base));
    deepMergeSessionAuth(base, { cookies: { applyTo: ["*"] } });
    expect(base).toEqual(baseCopy);
  });

  test("deeply merges nested objects", () => {
    const override = { cookies: { extract: ["TOKEN"] } };
    const result = deepMergeSessionAuth(base, override);
    expect(result.cookies.extract).toEqual(["TOKEN"]);
    expect(result.cookies.applyTo).toEqual(["POST", "PUT", "DELETE", "PATCH"]);
  });
});
