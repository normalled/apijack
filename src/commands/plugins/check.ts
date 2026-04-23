import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';
import {
    PluginNamespaceError,
    PluginCollisionError,
    PluginPeerMismatchError,
    PluginRegistrationError,
} from '../../plugin/errors';

export function registerCheck(
    parent: Command,
    registry: PluginRegistry,
    _coreVersion: string,
): void {
    parent
        .command('check')
        .description('Validate registered apijack plugins (namespace, collisions, peer version)')
        .action(() => {
            const errors: string[] = [];

            try {
                registry.validateAll();
            } catch (e) {
                if (
                    e instanceof PluginNamespaceError
                    || e instanceof PluginCollisionError
                    || e instanceof PluginPeerMismatchError
                    || e instanceof PluginRegistrationError
                ) {
                    errors.push(e.message);
                } else {
                    errors.push((e as Error).message);
                }
            }

            if (errors.length === 0) {
                process.stdout.write('All plugins OK.\n');
                process.exit(0);
            } else {
                for (const msg of errors) process.stdout.write(`${msg}\n`);

                process.exit(1);
            }
        });
}
