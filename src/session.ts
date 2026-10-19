import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { AuthStrategy, AuthSession, ResolvedAuth } from './auth/types';

/** The environment a per-environment session belongs to. */
export interface SessionBinding {
    /** config.json environment name; null when the credentials come from <CLI>_URL/_USER/_PASS. */
    env: string | null;
    baseUrl: string;
    username: string;
}

interface SessionFile extends SessionBinding {
    session: AuthSession;
}

// encodeEnvName() always escapes '@', so no config.json environment can map to this file.
const ENV_VAR_SESSION_FILE = '@env-vars.json';
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

function sessionsDir(configDir: string): string {
    return join(configDir, 'sessions');
}

// Percent-encoding keeps path separators and characters Windows rejects out of the filename.
// Windows also reserves device names before the first dot ("con.json"), so escape their
// first letter too. Both escapes are reversible, so distinct names get distinct filenames;
// only a case-insensitive filesystem folds "Dev" and "dev" into one file, and the env
// recorded inside it still keeps either from using the other's session.
function encodeEnvName(env: string): string {
    const encoded = encodeURIComponent(env).replace(/\*/g, '%2A');

    if (WINDOWS_DEVICE_NAME.test(encoded.split('.')[0]!)) {
        return `%${encoded.charCodeAt(0).toString(16).toUpperCase()}${encoded.slice(1)}`;
    }

    return encoded;
}

function sessionFilePath(configDir: string, env: string | null): string {
    return join(sessionsDir(configDir), env === null ? ENV_VAR_SESSION_FILE : `${encodeEnvName(env)}.json`);
}

export class SessionManager {
    private sessionPath: string;
    private binding: SessionBinding | null = null;

    constructor(cliName: string, sessionPathOverride?: string) {
        this.sessionPath
            = sessionPathOverride ?? join(homedir(), `.${cliName}`, 'session.json');
    }

    /**
     * Manage one environment's session at `<configDir>/sessions/<env>.json`. A cached
     * session recorded for a different environment, baseUrl or username is ignored.
     */
    static forEnvironment(configDir: string, binding: SessionBinding): SessionManager {
        const manager = new SessionManager('', sessionFilePath(configDir, binding.env));
        manager.binding = binding;

        return manager;
    }

    /** Delete one environment's cached session. Returns whether there was one. */
    static clear(configDir: string, env: string | null): boolean {
        const path = sessionFilePath(configDir, env);

        if (!existsSync(path)) return false;

        unlinkSync(path);

        return true;
    }

    /** Delete every environment's cached session. Returns whether there were any. */
    static clearAll(configDir: string): boolean {
        const dir = sessionsDir(configDir);
        const hadSessions = existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.json'));
        rmSync(dir, { recursive: true, force: true });

        return hadSessions;
    }

    async resolve(
        strategy: AuthStrategy,
        config: ResolvedAuth,
    ): Promise<AuthSession> {
        const cached = this.load();

        if (cached) {
            if (cached.expiresAt && Date.now() > cached.expiresAt) {
                if (strategy.refresh) {
                    const refreshed = await strategy.refresh(cached, config);
                    this.save(refreshed);

                    return refreshed;
                }
                // Expired with no refresh — fall through to re-authenticate
            } else {
                const restored = await strategy.restore(cached, config);

                if (restored) {
                    this.save(restored);

                    return restored;
                }
                // restore() returned null — fall through to re-authenticate
            }
        }

        const session = await strategy.authenticate(config);
        this.save(session);

        return session;
    }

    invalidate(): void {
        try {
            unlinkSync(this.sessionPath);
        } catch {
            // File may not exist — that's fine
        }
    }

    save(session: AuthSession): void {
        const dir = dirname(this.sessionPath);

        if (this.binding) {
            // Session files hold credentials and cookies, so sessions/ is owner-only.
            mkdirSync(dirname(dir), { recursive: true });
            mkdirSync(dir, { recursive: true, mode: 0o700 });

            // Projects that only gitignore the legacy .apijack/session.json would
            // otherwise commit session tokens.
            const gitignore = join(dir, '.gitignore');

            if (!existsSync(gitignore)) writeFileSync(gitignore, '*\n');
        } else {
            mkdirSync(dir, { recursive: true });
        }

        const contents: SessionFile | AuthSession = this.binding ? { ...this.binding, session } : session;
        writeFileSync(
            this.sessionPath,
            JSON.stringify(contents, null, 2) + '\n',
            this.binding ? { mode: 0o600 } : undefined,
        );
    }

    private load(): AuthSession | null {
        try {
            if (!existsSync(this.sessionPath)) return null;

            const parsed = JSON.parse(readFileSync(this.sessionPath, 'utf-8'));

            if (!this.binding) return parsed;

            const file = parsed as Partial<SessionFile>;
            const { env, baseUrl, username } = this.binding;

            if (file.env !== env || file.baseUrl !== baseUrl || file.username !== username) return null;

            return file.session ?? null;
        } catch {
            return null;
        }
    }
}
