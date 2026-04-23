import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';
import { loadPluginPeerInfo, checkPeerRange } from '../../plugin/peer-version';

export function registerCheck(
    parent: Command,
    registry: PluginRegistry,
    coreVersion: string,
): void {
    parent
        .command('check')
        .description('Validate registered apijack plugins (namespace, collisions, peer version)')
        .action(() => {
            const errors: string[] = [];

            // Namespace + collision errors
            const validationErrors = registry.validateAllCollected();

            for (const err of validationErrors) errors.push(err.message);

            // Peer-version errors
            for (const plugin of registry.getAll()) {
                if (!plugin.__package) continue;

                const info = loadPluginPeerInfo(plugin.__package.name, [process.cwd(), import.meta.dir]);
                const msg = checkPeerRange({
                    declaredRange: info.declaredRange,
                    installedVersion: coreVersion,
                });

                if (msg) {
                    errors.push(
                        `Plugin "${plugin.name}": peer range "${info.declaredRange ?? '(none)'}" does not include installed core ${coreVersion}`,
                    );
                }
            }

            if (errors.length === 0) {
                process.stdout.write('All plugins OK.\n');
                process.exit(0);
            } else {
                for (const msg of errors) process.stderr.write(`${msg}\n`);

                process.stderr.write(`\nFound ${errors.length} issue(s).\n`);
                process.exit(1);
            }
        });
}
