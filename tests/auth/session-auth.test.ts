import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { SessionAuthStrategy } from "../../src/auth/session-auth";
import type { AuthStrategy, AuthSession, ResolvedAuth, SessionAuthConfig } from "../../src/auth/types";

const resolvedAuth: ResolvedAuth = {
  baseUrl: "https://api.example.com",
  username: "admin",
  password: "secret",
};

const sessionConfig: SessionAuthConfig = {
  session: { endpoint: "/session" },
  cookies: {
    extract: ["SESSION", "XSRF-TOKEN"],
    applyTo: ["POST", "PUT", "DELETE"],
  },
  headerMirror: [
    { fromCookie: "XSRF-TOKEN", toHeader: "X-XSRF-TOKEN" },
  ],
  refreshOn: [401, 403],
};

const baseSession: AuthSession = {
  headers: { Authorization: "Basic YWRtaW46c2VjcmV0" },
};

function makeBaseStrategy(session: AuthSession = baseSession): AuthStrategy {
  return {
    authenticate: mock(async () => ({ ...session })),
    restore: mock(async (cached: AuthSession) => cached),
  };
}

function mockSessionFetch() {
  const originalFetch = globalThis.fetch;
  const mockFn = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.endsWith("/session")) {
      return new Response("{}", {
        status: 200,
        headers: [
          ["Set-Cookie", "SESSION=sess123; Path=/; HttpOnly"],
          ["Set-Cookie", "XSRF-TOKEN=xsrf456; Path=/"],
        ],
      });
    }
    return originalFetch(url, init);
  });
  globalThis.fetch = mockFn as typeof fetch;
  return { mockFn, restore: () => { globalThis.fetch = originalFetch; } };
}

describe("SessionAuthStrategy", () => {
  let fetchMock: ReturnType<typeof mockSessionFetch>;

  beforeEach(() => {
    fetchMock = mockSessionFetch();
  });

  afterEach(() => {
    fetchMock.restore();
  });

  test("authenticate() calls base strategy then hits session endpoint", async () => {
    const base = makeBaseStrategy();
    await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    expect(base.authenticate).toHaveBeenCalledTimes(1);
    expect(fetchMock.mockFn).toHaveBeenCalledTimes(1);
    const fetchUrl = (fetchMock.mockFn as any).mock.calls[0][0] as string;
    expect(fetchUrl).toBe("https://api.example.com/session");
  });

  test("authenticate() extracts named cookies from Set-Cookie", async () => {
    const base = makeBaseStrategy();
    const session = await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    expect(session.cookies).toBeDefined();
    expect(session.cookies!.SESSION).toBe("sess123");
    expect(session.cookies!["XSRF-TOKEN"]).toBe("xsrf456");
  });

  test("authenticate() excludes cookies not in extract list", async () => {
    globalThis.fetch = mock(async () => new Response("{}", {
      status: 200,
      headers: [
        ["Set-Cookie", "SESSION=sess123; Path=/"],
        ["Set-Cookie", "XSRF-TOKEN=xsrf456; Path=/"],
        ["Set-Cookie", "JSESSIONID=unwanted; Path=/"],
      ],
    })) as typeof fetch;

    const base = makeBaseStrategy();
    const session = await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    expect(session.cookies!.SESSION).toBe("sess123");
    expect(session.cookies!["XSRF-TOKEN"]).toBe("xsrf456");
    expect(session.cookies!["JSESSIONID"]).toBeUndefined();
  });

  test("authenticate() preserves base headers", async () => {
    const base = makeBaseStrategy();
    const session = await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    expect(session.headers.Authorization).toBe("Basic YWRtaW46c2VjcmV0");
  });

  test("authenticate() sends base headers in session endpoint request", async () => {
    const base = makeBaseStrategy();
    await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    const fetchInit = (fetchMock.mockFn as any).mock.calls[0][1] as RequestInit;
    expect(fetchInit.headers).toEqual({ Authorization: "Basic YWRtaW46c2VjcmV0" });
  });

  test("authenticate() uses configured HTTP method", async () => {
    const base = makeBaseStrategy();
    const postConfig = { ...sessionConfig, session: { endpoint: "/session", method: "POST" } };
    await new SessionAuthStrategy(base, postConfig).authenticate(resolvedAuth);
    const fetchInit = (fetchMock.mockFn as any).mock.calls[0][1] as RequestInit;
    expect(fetchInit.method).toBe("POST");
  });

  test("authenticate() defaults to GET method", async () => {
    const base = makeBaseStrategy();
    await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    const fetchInit = (fetchMock.mockFn as any).mock.calls[0][1] as RequestInit;
    expect(fetchInit.method).toBe("GET");
  });

  test("authenticate() handles cookie values containing '=' characters", async () => {
    globalThis.fetch = mock(async () => new Response("{}", {
      status: 200,
      headers: [
        ["Set-Cookie", "SESSION=dGVzdD10ZXN0==; Path=/; HttpOnly"],
        ["Set-Cookie", "XSRF-TOKEN=abc=def=ghi; Path=/"],
      ],
    })) as typeof fetch;

    const base = makeBaseStrategy();
    const session = await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    expect(session.cookies!.SESSION).toBe("dGVzdD10ZXN0==");
    expect(session.cookies!["XSRF-TOKEN"]).toBe("abc=def=ghi");
  });

  test("authenticate() uses redirect: manual to preserve Set-Cookie headers", async () => {
    const base = makeBaseStrategy();
    await new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth);
    const fetchInit = (fetchMock.mockFn as any).mock.calls[0][1] as RequestInit;
    expect(fetchInit.redirect).toBe("manual");
  });

  test("authenticate() throws when session endpoint returns error", async () => {
    globalThis.fetch = mock(async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;
    const base = makeBaseStrategy();
    await expect(new SessionAuthStrategy(base, sessionConfig).authenticate(resolvedAuth)).rejects.toThrow();
  });

  test("restore() returns null when base.restore() returns null", async () => {
    const base = makeBaseStrategy();
    (base.restore as any).mockImplementation(async () => null);
    const cached: AuthSession = { headers: { Authorization: "Basic old" }, cookies: { SESSION: "old" } };
    const result = await new SessionAuthStrategy(base, sessionConfig).restore(cached, resolvedAuth);
    expect(result).toBeNull();
  });

  test("restore() returns cached session with cookies when base succeeds", async () => {
    const base = makeBaseStrategy();
    const cached: AuthSession = {
      headers: { Authorization: "Basic cached" },
      cookies: { SESSION: "cached_sess", "XSRF-TOKEN": "cached_xsrf" },
    };
    const result = await new SessionAuthStrategy(base, sessionConfig).restore(cached, resolvedAuth);
    expect(result).not.toBeNull();
    expect(result!.cookies!.SESSION).toBe("cached_sess");
  });

  test("restore() returns null when session is expired", async () => {
    const base = makeBaseStrategy();
    const cached: AuthSession = {
      headers: { Authorization: "Basic cached" },
      cookies: { SESSION: "expired" },
      expiresAt: Date.now() - 1000,
    };
    const result = await new SessionAuthStrategy(base, sessionConfig).restore(cached, resolvedAuth);
    expect(result).toBeNull();
  });

  test("refresh() re-authenticates by hitting session endpoint", async () => {
    const base = makeBaseStrategy();
    const strategy = new SessionAuthStrategy(base, sessionConfig);
    const oldSession: AuthSession = { headers: { Authorization: "Basic old" }, cookies: { SESSION: "old_sess" } };
    const refreshed = await strategy.refresh!(oldSession, resolvedAuth);
    expect(refreshed.cookies!.SESSION).toBe("sess123");
    expect(fetchMock.mockFn).toHaveBeenCalledTimes(1);
  });
});
