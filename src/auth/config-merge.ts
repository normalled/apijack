import type { SessionAuthConfig } from './types';

/**
 * Deep merge two SessionAuthConfig objects.
 * Override values take precedence. Arrays are replaced entirely (not concatenated).
 * Neither input is mutated.
 */
export function deepMergeSessionAuth(
    base: SessionAuthConfig,
    override: Partial<SessionAuthConfig> | undefined,
): SessionAuthConfig {
    // Preserve function fields that structuredClone would strip
    const baseFn = base.onChallenge;
    const overrideFn = override?.onChallenge;

    const cloned = structuredClone({ ...base, onChallenge: undefined });

    if (override) {
        const { onChallenge: _, ...overrideData } = override;
        deepMerge(cloned, overrideData);
    }

    const result = cloned as SessionAuthConfig;
    result.onChallenge = overrideFn ?? baseFn;

    return result;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(source)) {
        const srcVal = source[key];
        const tgtVal = target[key];

        if (Array.isArray(srcVal)) {
            target[key] = [...srcVal];
        } else if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)
            && tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
            target[key] = deepMerge(
                tgtVal as Record<string, unknown>,
                srcVal as Record<string, unknown>,
            );
        } else {
            target[key] = srcVal;
        }
    }

    return target;
}
