import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import semver from 'semver';

export interface PeerCheckInput {
    declaredRange: string | undefined;
    installedVersion: string;
}

/**
 * Compare an installed version against a plugin's declared peer range.
 * Returns null if OK (including when the plugin didn't declare a peer),
 * or a human-readable message on mismatch.
 */
export function checkPeerRange(input: PeerCheckInput): string | null {
    if (input.declaredRange == null) return null;

    if (!semver.validRange(input.declaredRange)) {
        return `invalid peer range "${input.declaredRange}"`;
    }

    if (semver.satisfies(input.installedVersion, input.declaredRange)) return null;

    return `peer range "${input.declaredRange}" does not include installed version ${input.installedVersion}`;
}

export interface PluginPeerInfo {
    declaredRange: string | undefined;
    packagePath: string | null;
}

/**
 * Locate a plugin's package.json on disk (via node_modules walk) and read
 * its @apijack/core peer range. Returns { declaredRange: undefined, packagePath: null }
 * if the package can't be found or has no declared peer range.
 */
export function loadPluginPeerInfo(packageName: string, searchFromDir: string): PluginPeerInfo {
    const pkgPath = findPluginPackageJson(packageName, searchFromDir);

    if (!pkgPath) return { declaredRange: undefined, packagePath: null };

    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
            peerDependencies?: Record<string, string>;
        };
        const range = pkg.peerDependencies?.['@apijack/core'];

        return { declaredRange: range, packagePath: pkgPath };
    } catch {
        return { declaredRange: undefined, packagePath: pkgPath };
    }
}

function findPluginPackageJson(packageName: string, startDir: string): string | null {
    let dir = startDir;

    while (true) {
        const candidate = join(dir, 'node_modules', packageName, 'package.json');

        if (existsSync(candidate)) return candidate;

        const parent = dirname(dir);

        if (parent === dir) return null;

        dir = parent;
    }
}
