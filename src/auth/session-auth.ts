import type { AuthStrategy, AuthSession, ResolvedAuth, SessionAuthConfig } from './types';

export class SessionAuthStrategy implements AuthStrategy {
    constructor(
        private base: AuthStrategy,
        private config: SessionAuthConfig,
    ) {
        if (config.cookies.extract.length === 0) {
            console.warn('SessionAuthStrategy: cookies.extract is empty — no cookies will be captured');
        }
    }

    async authenticate(config: ResolvedAuth): Promise<AuthSession> {
        const baseSession = await this.base.authenticate(config);

        const method = this.config.session.method ?? 'GET';
        const url = config.baseUrl + this.config.session.endpoint;

        const res = await fetch(url, {
            method,
            headers: baseSession.headers,
            redirect: 'manual',
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Session endpoint ${url} returned ${res.status}: ${body}`);
        }

        const cookies = this.extractCookies(res);

        return {
            headers: baseSession.headers,
            cookies,
            expiresAt: baseSession.expiresAt,
            data: baseSession.data,
        };
    }

    async restore(cached: AuthSession, config: ResolvedAuth): Promise<AuthSession | null> {
        if (cached.expiresAt && Date.now() > cached.expiresAt) {
            return null;
        }

        const baseRestored = await this.base.restore(cached, config);
        if (!baseRestored) return null;

        return {
            headers: baseRestored.headers,
            cookies: cached.cookies,
            expiresAt: baseRestored.expiresAt,
            data: baseRestored.data,
        };
    }

    async refresh(_session: AuthSession, config: ResolvedAuth): Promise<AuthSession> {
        return this.authenticate(config);
    }

    private extractCookies(res: Response): Record<string, string> {
        const cookies: Record<string, string> = {};
        const setCookies = res.headers.getSetCookie();
        const extractNames = new Set(this.config.cookies.extract);

        for (const raw of setCookies) {
            const [nameValue] = raw.split(';');
            const eqIdx = nameValue.indexOf('=');
            if (eqIdx < 0) continue;
            const name = nameValue.slice(0, eqIdx).trim();
            const value = nameValue.slice(eqIdx + 1).trim();
            if (extractNames.has(name)) {
                cookies[name] = value;
            }
        }

        return cookies;
    }
}
