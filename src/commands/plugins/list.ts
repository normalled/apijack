import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';

export function registerList(parent: Command, registry: PluginRegistry, _coreVersion: string): void {
    parent
        .command('list')
        .description('List registered apijack plugins')
        .action(() => {
            const plugins = registry.getAll();

            if (plugins.length === 0) {
                process.stdout.write('No plugins registered.\n');

                return;
            }

            const rows = plugins.map(p => ({
                name: p.name,
                version: p.version ?? '-',
                status: 'ok',
            }));
            const nameWidth = Math.max(4, ...rows.map(r => r.name.length));
            const verWidth = Math.max(7, ...rows.map(r => r.version.length));
            process.stdout.write(
                `${'NAME'.padEnd(nameWidth)}  ${'VERSION'.padEnd(verWidth)}  STATUS\n`,
            );

            for (const r of rows) {
                process.stdout.write(
                    `${r.name.padEnd(nameWidth)}  ${r.version.padEnd(verWidth)}  ${r.status}\n`,
                );
            }
        });
}
