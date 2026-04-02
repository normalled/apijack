import { existsSync } from 'fs';
import { join } from 'path';

export interface PreRequestHookConfig {
    handler: (req: { method: string; url: string; body?: unknown }) => void;
    beforeDryRun: boolean;
}

export async function loadPreRequestHook(configDir: string): Promise<PreRequestHookConfig | null> {
    const tsPath = join(configDir, 'pre-request.ts');
    const jsPath = join(configDir, 'pre-request.js');

    const hookPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;

    if (!hookPath) return null;

    try {
        const mod = await import(hookPath);
        const handler = mod.default;

        if (typeof handler !== 'function') return null;

        return {
            handler,
            beforeDryRun: mod.beforeDryRun === true,
        };
    } catch (err) {
        process.stderr.write(`Warning: failed to load pre-request hook from ${hookPath}: ${err}\n`);

        return null;
    }
}
