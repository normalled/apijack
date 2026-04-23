import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';
import { loadPluginPeerInfo } from '../../plugin/peer-version';

export function registerList(parent: Command, registry: PluginRegistry): void {
    parent
        .command('list')
        .description('List registered apijack plugins')
        .action(() => {
            const plugins = registry.getAll();

            if (plugins.length === 0) {
                process.stdout.write('No plugins registered.\n');

                return;
            }

            const rows = plugins.map((p) => {
                const peerInfo = p.__package
                    ? loadPluginPeerInfo(p.__package.name, [process.cwd(), import.meta.dir])
                    : null;

                return {
                    name: p.name,
                    version: p.version ?? '-',
                    peer: peerInfo?.declaredRange ?? '-',
                    status: 'ok',
                };
            });
            const nameWidth = Math.max(4, ...rows.map(r => r.name.length));
            const verWidth = Math.max(7, ...rows.map(r => r.version.length));
            const peerWidth = Math.max(4, ...rows.map(r => r.peer.length));
            process.stdout.write(
                `${'NAME'.padEnd(nameWidth)}  ${'VERSION'.padEnd(verWidth)}  ${'PEER'.padEnd(peerWidth)}  STATUS\n`,
            );

            for (const r of rows) {
                process.stdout.write(
                    `${r.name.padEnd(nameWidth)}  ${r.version.padEnd(verWidth)}  ${r.peer.padEnd(peerWidth)}  ${r.status}\n`,
                );
            }
        });
}
