import type { CustomResolverHelpers } from '../../../../../src/types';

export const name = '_uppercase';

export default function uppercase(argsStr?: string, helpers?: CustomResolverHelpers): string {
    const raw = argsStr ?? '';
    const resolved = helpers ? String(helpers.resolve(raw)) : raw;

    return resolved.toUpperCase();
}
