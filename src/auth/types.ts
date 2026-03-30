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
    refreshOn?: number[];
}
