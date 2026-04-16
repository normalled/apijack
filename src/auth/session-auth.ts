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
        const baseUrl = config.baseUrl + this.config.session.endpoint;

        let res = await fetch(baseUrl, {
            method,
            headers: baseSession.headers,
            redirect: 'manual',
        });

        let challengeCookies: Record<string, string> | undefined;

        if (!res.ok && this.config.onChallenge) {
            let body = await res.text();
            challengeCookies = this.collectAllCookies(res);
            let params = await this.config.onChallenge(res.status, body);

            while (params) {
                const retryUrl = new URL(baseUrl);

                for (const [k, v] of Object.entries(params)) {
                    retryUrl.searchParams.set(k, v);
                }

                const retryHeaders: Record<string, string> = { ...baseSession.headers };

                if (Object.keys(challengeCookies).length > 0) {
                    retryHeaders.Cookie = Object.entries(challengeCookies)
                        .map(([k, v]) => `${k}=${v}`)
                        .join('; ');
                }

                res = await fetch(retryUrl.toString(), {
                    method,
                    headers: retryHeaders,
                    redirect: 'manual',
                });

                // Accumulate cookies across retries
                Object.assign(challengeCookies, this.collectAllCookies(res));

                if (res.ok) break;

                body = await res.text();
                params = await this.config.onChallenge(res.status, body);
            }
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Session endpoint ${baseUrl} returned ${res.status}: ${body}`);
        }

        // Merge challenge cookies (e.g. remember_device) with extracted session cookies
        const cookies = { ...challengeCookies, ...this.extractCookies(res) };

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

    private collectAllCookies(res: Response): Record<string, string> {
        const cookies: Record<string, string> = {};

        for (const raw of res.headers.getSetCookie()) {
            const [nameValue] = raw.split(';');
            const eqIdx = nameValue.indexOf('=');

            if (eqIdx < 0) continue;

            cookies[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
        }

        return cookies;
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
