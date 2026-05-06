export interface AuthStrategy {
    authenticate(config: ResolvedAuth): Promise<AuthSession>;
    restore(cached: AuthSession, config: ResolvedAuth): Promise<AuthSession | null>;
    refresh?(session: AuthSession, config: ResolvedAuth): Promise<AuthSession>;
}

export interface AuthSession {
    headers: Record<string, string>;
    cookies?: Record<string, string>;
    expiresAt?: number;
    data?: Record<string, unknown>;
}

export interface ResolvedAuth {
    baseUrl: string;
    username: string;
    password: string;
}

export interface SessionAuthConfig {
    session: {
        endpoint: string;
        method?: string;
    };
    cookies: {
        extract: string[];
        applyTo?: string[];
    };
    headerMirror?: Array<{
        fromCookie: string;
        toHeader: string;
        applyTo?: string[];
    }>;
    /**
     * HTTP statuses that trigger a one-shot session refresh + retry on the original request.
     * Opt-in. Common value for stale-session recovery: `[401]` (or `[401, 403]` for servers
     * that map an expired session to 403). The generated client invokes the refresh callback,
     * which re-bootstraps `/session`, then retries the original request once.
     */
    refreshOn?: number[];
    /**
     * When true, drops the base strategy's headers (e.g. `Authorization: Basic …`) from the
     * returned `AuthSession` after the `/session` handshake completes. The base headers are
     * still sent to the session endpoint itself; only post-handshake API calls carry just
     * cookies + `headerMirror` headers. Required for stateful backends (e.g. Spring Security
     * with 2FA) where re-presenting the base credentials on every call re-triggers auth filters
     * and invalidates the active session.
     *
     * Drops *all* headers contributed by the base strategy, not just `Authorization`. If a
     * custom base strategy contributes non-auth headers you need to keep, write a custom
     * `AuthStrategy` instead of using this flag.
     */
    dropBaseHeaders?: boolean;
    /** Called when the session endpoint returns a non-OK response. Return query params to retry, or null to give up. */
    onChallenge?: (status: number, body: string) => Promise<Record<string, string> | null>;
}
