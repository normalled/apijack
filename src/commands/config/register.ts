import { Command } from 'commander';
import { listEnvironments, switchEnvironment, saveEnvironment, loadConfig, verifyCredentials, type ResolvedEnvironment } from '../../config';
import { SessionManager } from '../../session';
import { prompt, hiddenPrompt } from '../../prompt';
import { configListAction } from './list/list';
import { configSwitchAction } from './switch/switch';
import { configClearSessionAction } from './clear-session/clear-session';
import { configImportAction } from './import/import';
import { configUpdatePasswordAction } from './update-password/update-password';

export function registerConfigCommand(
    program: Command,
    cliName: string,
    opts?: {
        configPath?: string;
        knownSites?: Record<string, { url: string; description: string; group?: string }>;
        allowedCidrs?: string[];
        /** Display name for user-facing hints. Defaults to cliName. */
        displayName?: string;
        /** Per-environment session store; registers `config clear-session` when set. */
        sessions?: {
            /** Directory whose sessions/ subdirectory holds one session file per environment. */
            configDir: string;
            /** The environment the next command would use. */
            currentEnvironment: () => ResolvedEnvironment | null;
        };
    },
): void {
    const configOpts = opts?.configPath ? { configPath: opts.configPath } : undefined;
    const displayName = opts?.displayName ?? cliName;
    const config = program
        .command('config')
        .description('Manage environment configurations');

    config
        .command('list')
        .description('List all configured environments')
        .action(async () => {
            const envs = await configListAction({
                listEnvs: () => listEnvironments(cliName, configOpts),
            });

            if (envs.length === 0) {
                console.log(`No environments configured. Run '${displayName} setup' to add one.`);

                return;
            }

            for (const env of envs) {
                const marker = env.active ? '* ' : '  ';
                console.log(`${marker}${env.name}\t${env.url}\t${env.user}`);
            }
        });

    config
        .command('switch <name>')
        .description('Switch active environment')
        .action(async (name: string) => {
            const result = await configSwitchAction({
                name,
                switchEnv: n => switchEnvironment(cliName, n, configOpts),
                listEnvs: () => listEnvironments(cliName, configOpts),
            });

            if (!result.ok) {
                console.error(`Environment '${name}' not found. Available: ${result.available?.join(', ') || 'none'}`);
                process.exit(1);
            }

            console.log(`Switched to '${name}'`);
        });

    if (opts?.sessions) {
        const { configDir, currentEnvironment } = opts.sessions;
        config
            .command('clear-session [name]')
            .description('Delete a cached session so the next command logs in again (defaults to the active environment)')
            .option('--all', 'Delete every environment\'s cached session')
            .action(async (name: string | undefined, cmdOpts: { all?: boolean }) => {
                const result = await configClearSessionAction({
                    name,
                    all: cmdOpts.all,
                    currentEnvironment,
                    listEnvs: () => listEnvironments(cliName, configOpts),
                    clear: env => SessionManager.clear(configDir, env),
                    clearAll: () => SessionManager.clearAll(configDir),
                });

                if (!result.ok) {
                    if (result.reason === 'name-with-all') {
                        console.error('Pass an environment name or --all, not both.');
                    } else if (result.reason === 'unknown-env') {
                        console.error(`Environment '${name}' not found. Available: ${result.available.join(', ') || 'none'}`);
                    } else {
                        console.error(`No environments configured. Run '${displayName} setup' to add one.`);
                    }

                    process.exit(1);
                }

                if (result.scope === 'all') {
                    console.log(result.cleared ? 'Cleared every environment\'s session.' : 'No cached sessions.');

                    return;
                }

                const target = result.env === null ? `the ${cliName.toUpperCase()}_URL credentials` : `'${result.env}'`;
                console.log(result.cleared ? `Cleared the session for ${target}.` : `No cached session for ${target}.`);
            });
    }

    if (opts?.knownSites) {
        const knownSites = opts.knownSites;
        config
            .command('import [alias]')
            .description('Import a known site — only provide credentials')
            .option('--user <email>', 'Email for authentication')
            .option('--password <password>', 'Password for authentication')
            .option('--allow-insecure-storage', 'Allow plaintext storage for production URLs')
            .action(async (aliasArg: string | undefined, cmdOpts: { user?: string; password?: string; allowInsecureStorage?: boolean }) => {
                let alias = aliasArg;

                if (!alias) {
                    const siteEntries = Object.entries(knownSites);

                    if (siteEntries.length === 0) {
                        console.error('No known sites configured.');
                        process.exit(1);
                    }

                    console.log('\nAvailable sites:');
                    siteEntries.forEach(([name, site], i) => {
                        console.log(`  ${(i + 1).toString().padStart(2)}. ${name.padEnd(22)} ${site.description}`);
                    });

                    const selection = await prompt(`\nSelect site (1-${siteEntries.length}): `);
                    const index = parseInt(selection);

                    if (index < 1 || index > siteEntries.length) {
                        console.error('Invalid selection.');
                        process.exit(1);
                    }

                    alias = siteEntries[index - 1]![0];
                }

                const user = cmdOpts.user ?? (await prompt('Email: '));
                const password = cmdOpts.password ?? (await hiddenPrompt('Password: '));

                if (!user || !password) {
                    console.error('Email and password are required.');
                    process.exit(1);
                }

                try {
                    const result = await configImportAction({
                        alias,
                        knownSites,
                        user,
                        password,
                        cliName,
                        verify: verifyCredentials,
                        save: saveEnvironment,
                        saveOpts: {
                            ...configOpts,
                            allowInsecureStorage: cmdOpts.allowInsecureStorage,
                            allowedCidrs: opts?.allowedCidrs,
                        },
                    });

                    if (!result.verified) {
                        console.error(result.verifyReason);
                        console.error("Credentials saved anyway — they'll be used when the server is available.");
                    } else {
                        console.log('Credentials verified.');
                    }

                    console.log(`Saved and switched to '${alias}'.`);
                } catch (err) {
                    console.error(err instanceof Error ? err.message : String(err));
                    process.exit(1);
                }
            });

        config
            .command('update-password [name]')
            .description('Update password for an environment (defaults to active)')
            .option('--password <password>', 'New password')
            .action(async (name: string | undefined, cmdOpts: { password?: string }) => {
                // Validate environment exists before prompting for password
                const cfg = await loadConfig(cliName, configOpts);

                if (!cfg || Object.keys(cfg.environments).length === 0) {
                    console.error(`No environments configured. Run '${displayName} config import' first.`);
                    process.exit(1);
                }

                const envName = name ?? cfg.active;

                if (!cfg.environments[envName]) {
                    console.error(`Environment '${envName}' not found.`);
                    process.exit(1);
                }

                console.log(`Updating password for '${envName}' (${cfg.environments[envName].url})`);

                const password = cmdOpts.password ?? (await hiddenPrompt('New password: '));

                if (!password) {
                    console.error('Password is required.');
                    process.exit(1);
                }

                try {
                    await configUpdatePasswordAction({
                        envName,
                        password,
                        loadConfig: async () => cfg,
                        save: saveEnvironment,
                        cliName,
                        displayName,
                        saveOpts: configOpts ?? {},
                    });
                    console.log('Password updated.');
                } catch (err) {
                    console.error(err instanceof Error ? err.message : String(err));
                    process.exit(1);
                }
            });
    }
}
