import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { installPlugin } from './install';
import { uninstallPlugin } from './uninstall';
import { getPluginPaths } from './paths';

export function registerPluginCommand(
    program: Command,
    _cliName: string,
    version: string,
): void {
    const plugin = program
        .command('plugin')
        .description('Manage Claude Code plugin registration');

    plugin
        .command('install')
        .description('Register as a Claude Code plugin')
        .option('--cli-invocation <args...>', 'How to invoke this CLI (e.g., bun run src/cli.ts)')
        .option('--generated-dir <dir>', 'Path to generated files directory', 'src/generated')
        .action(async (opts: { cliInvocation?: string[]; generatedDir?: string }) => {
            const paths = getPluginPaths(version);

            const cliInvocation = opts.cliInvocation ?? process.argv.slice(0, 2);

            // Build the bundle if it doesn't exist
            const bundlePath = resolve(paths.sourceDir, 'dist', 'mcp-server.bundle.js');
            if (!existsSync(bundlePath)) {
                console.log('Building MCP server bundle...');
                const buildScript = resolve(paths.sourceDir, 'scripts', 'build-plugin.ts');
                const proc = Bun.spawn(['bun', 'run', buildScript], {
                    stdout: 'inherit',
                    stderr: 'inherit',
                });
                const exitCode = await proc.exited;
                if (exitCode !== 0) {
                    console.error('Bundle build failed.');
                    process.exit(1);
                }
            }

            const result = await installPlugin({
                version,
                claudeDir: paths.claudeDir,
                userDataDir: paths.userDataDir,
                sourceDir: paths.sourceDir,
                cliInvocation,
                generatedDir: opts.generatedDir ?? 'src/generated',
            });

            if (result.success) {
                console.log(result.message);
                console.log(`\n  Plugin cache:  ${result.pluginCacheDir}`);
                console.log(`  User data:     ${paths.userDataDir}`);
                console.log(`  CLI invocation: ${cliInvocation.join(' ')}`);
                console.log('\nRestart Claude Code to activate the plugin.');
            }
        });

    plugin
        .command('uninstall')
        .description('Remove Claude Code plugin registration')
        .action(async () => {
            const paths = getPluginPaths(version);
            const result = await uninstallPlugin({ claudeDir: paths.claudeDir });
            console.log(result.message);
        });
}
