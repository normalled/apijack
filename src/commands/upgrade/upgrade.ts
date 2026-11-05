import { Command } from 'commander';
import { defaultSpawnCli, refreshAfterUpdate } from '../../post-update';

export interface UpgradeInput {
    currentVersion: string;
    checkLatest: () => Promise<string>;
    install: (version: string) => Promise<number>;
}

export interface UpgradeResult {
    previousVersion: string;
    newVersion: string;
}

export async function upgradeAction(input: UpgradeInput): Promise<UpgradeResult | null> {
    const latest = await input.checkLatest();

    if (latest === input.currentVersion) return null;

    const exitCode = await input.install(latest);

    if (exitCode !== 0) throw new Error('Upgrade failed.');

    return { previousVersion: input.currentVersion, newVersion: latest };
}

async function checkNpmLatest(): Promise<string> {
    const res = await fetch('https://registry.npmjs.org/@apijack/core/latest');

    if (!res.ok) throw new Error('Failed to check for updates.');

    const data = await res.json() as { version: string };

    return data.version;
}

async function bunInstallGlobal(version: string): Promise<number> {
    const proc = Bun.spawn(['bun', 'install', '-g', `@apijack/core@${version}`], {
        stdout: 'inherit',
        stderr: 'inherit',
    });

    return proc.exited;
}

export function registerUpgradeCommand(
    program: Command,
    version: string,
    opts?: { reinstallPlugin?: () => boolean },
): void {
    program
        .command('upgrade')
        .description('Check for and install the latest version')
        .action(async () => {
            try {
                const result = await upgradeAction({
                    currentVersion: version,
                    checkLatest: checkNpmLatest,
                    install: bunInstallGlobal,
                });

                if (!result) {
                    console.log(`Already on the latest version (v${version}).`);

                    return;
                }

                console.log(`v${result.previousVersion} → v${result.newVersion}`);

                await refreshAfterUpdate({
                    reinstallPlugin: opts?.reinstallPlugin?.() ?? false,
                    spawnCli: defaultSpawnCli(),
                });

                console.log(`Upgraded to v${result.newVersion}.`);
            } catch (err) {
                console.error(err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });
}
