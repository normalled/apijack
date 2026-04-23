import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';
import { registerList } from './list';

export function registerPluginsCommand(
    program: Command,
    registry: PluginRegistry,
    coreVersion: string,
): void {
    const plugins = program
        .command('plugins')
        .description('Inspect registered apijack plugins');
    registerList(plugins, registry, coreVersion);
}
