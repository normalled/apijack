import { Command } from 'commander';
import { listEnvironments, switchEnvironment, saveEnvironment, loadConfig, verifyCredentials } from '../../config';
import { SessionManager } from '../../session';
import { prompt, hiddenPrompt } from '../../prompt';
import { configListAction } from './list/list';
import { configSwitchAction } from './switch/switch';
import { configImportAction } from './import/import';
import { configUpdatePasswordAction } from './update-password/update-password';

export function registerConfigCommand(
    program: Command,
    cliName: string,
    opts?: {
        configPath?: string;
        knownSites?: Record<string, { url: string; description: string; group?: string }>;
        allowedCidrs?: string[];
    },
): void {
    const configOpts = opts?.configPath ? { configPath: opts.configPath } : undefined;
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
                console.log(`No environments configured. Run '${cliName} setup' to add one.`);

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
            const sessionMgr = new SessionManager(cliName);
            const result = await configSwitchAction({
                name,
                switchEnv: n => switchEnvironment(cliName, n, configOpts),
                invalidateSession: () => sessionMgr.invalidate(),
                listEnvs: () => listEnvironments(cliName, configOpts),
            });

            if (!result.ok) {
                console.error(`Environment '${name}' not found. Available: ${result.available?.join(', ') || 'none'}`);
                process.exit(1);
            }

            console.log(`Switched to '${name}'`);
        });

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
                    console.error(`No environments configured. Run '${cliName} config import' first.`);
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
