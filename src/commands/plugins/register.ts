import type { Command } from 'commander';
import type { PluginRegistry } from '../../plugin/registry';
import { registerList } from './list';
import { registerCheck } from './check';

export function registerPluginsCommand(
    program: Command,
    registry: PluginRegistry,
    coreVersion: string,
): void {
    const plugins = program
        .command('plugins')
        .description('Inspect registered apijack plugins');
    registerList(plugins, registry);
    registerCheck(plugins, registry, coreVersion);
}
