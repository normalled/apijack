import type { AuthSession, SessionAuthConfig } from './types';

export function resolveRequestHeaders(
    session: AuthSession,
    config: SessionAuthConfig | undefined,
    method: string,
): Record<string, string> {
    const headers = { ...session.headers };

    if (!config || !session.cookies) return headers;

    const upperMethod = method.toUpperCase();
    const cookieApplies = methodMatches(upperMethod, config.cookies.applyTo);

    if (cookieApplies) {
        const cookieParts = Object.entries(session.cookies)
            .map(([name, value]) => `${name}=${value}`);

        if (cookieParts.length > 0) {
            headers['Cookie'] = cookieParts.join('; ');
        }

        for (const mirror of config.headerMirror ?? []) {
            const mirrorApplies = mirror.applyTo
                ? methodMatches(upperMethod, mirror.applyTo)
                : true;

            if (mirrorApplies && session.cookies[mirror.fromCookie]) {
                headers[mirror.toHeader] = session.cookies[mirror.fromCookie];
            }
        }
    }

    return headers;
}

function methodMatches(method: string, applyTo?: string[]): boolean {
    if (!applyTo) return true;

    return applyTo.some(m => m === '*' || m.toUpperCase() === method);
}
