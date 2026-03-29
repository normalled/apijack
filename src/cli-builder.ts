import { Command } from 'commander';
import type {
    CliOptions,
    CliContext,
    CommandRegistrar,
    DispatcherHandler,
    CommandDispatcher,
} from './types';
import { resolveAuth, verifyCredentials, saveEnvironment } from './config';
import { SessionManager } from './session';
import { formatOutput, type OutputMode } from './output';
import { formatDryRun, formatCurl, type CapturedRequest } from './output-request';
import { buildDispatcher } from './routine/dispatcher';
import { homedir } from 'os';
import { resolve, join } from 'path';
import { registerPluginCommand } from './plugin/register';
import { registerSetupCommand, setupAction } from './commands/setup/setup';
import { registerConfigCommand } from './commands/config/register';
import { registerGenerateCommand } from './commands/generate/generate';
import { registerUpgradeCommand } from './commands/upgrade/upgrade';
import { registerMcpCommand } from './commands/mcp/mcp';
import { registerRoutineCommand, loadBuiltinRoutines } from './commands/routine/register';
import { prompt, hiddenPrompt } from './prompt';

export interface Cli {
    command(name: string, registrar: CommandRegistrar): void;
    dispatcher(name: string, handler: DispatcherHandler): void;
    run(): Promise<void>;
}

const CORE_COMMANDS = new Set([
    'setup',
    'login',
    'config',
    'generate',
    'routine',
    'upgrade',
    'mcp',
    'plugin',
]);

function showCustomHelp(program: Command, cliName: string, showAll: boolean): void {
    console.log(`Usage: ${program.name()} [options] [command]\n`);
    console.log(`${program.description()}\n`);

    // Options
    console.log('Options:');
    for (const opt of program.options) {
        console.log(`  ${opt.flags.padEnd(30)} ${opt.description}`);
    }
    console.log(`  ${'-h, --help'.padEnd(30)} display help for command`);

    // Core commands
    const core = program.commands.filter(c => CORE_COMMANDS.has(c.name()));
    const api = program.commands.filter(
        c => !CORE_COMMANDS.has(c.name()) && c.name() !== 'help',
    );

    if (core.length > 0) {
        console.log('\nCommands:');
        for (const cmd of core) {
            console.log(`  ${cmd.name().padEnd(30)} ${cmd.description()}`);
        }
    }

    if (showAll && api.length > 0) {
        console.log(`\nAPI Commands (${api.length}):`);
        for (const cmd of api) {
            console.log(`  ${cmd.name()}`);
        }
    } else if (api.length > 0) {
        console.log(
            `\n  ${api.length} API command groups available — run '${cliName} --help' to list all`,
        );
    }

    console.log(`\nRun '${cliName} <command> --help' for details on any command.`);
}

export function createCli(options: CliOptions): Cli {
    const consumerCommands: { name: string; registrar: CommandRegistrar }[] = [];
    const consumerDispatchers = new Map<string, DispatcherHandler>();
    const cliName = options.name;
    const configOpts = options.configPath ? { configPath: options.configPath } : undefined;
    const configDir = options.configPath
        ? resolve(options.configPath, '..')
        : join(homedir(), `.${cliName}`);
    const routinesDir = join(configDir, 'routines');
    const generatedDir = options.generatedDir ?? join(process.cwd(), 'src', 'generated');

    const cli: Cli = {
        command(name: string, registrar: CommandRegistrar): void {
            consumerCommands.push({ name, registrar });
        },

        dispatcher(name: string, handler: DispatcherHandler): void {
            consumerDispatchers.set(name, handler);
        },

        async run(): Promise<void> {
            const program = new Command();

            // 1. Build Commander program
            program
                .name(cliName)
                .description(options.description)
                .version(options.version);

            // 2. Register output mode flags
            if (options.outputModes?.includes('table')) {
                program.option('--table', 'Output as table');
            }
            if (options.outputModes?.includes('quiet')) {
                program.option('--quiet', 'Suppress output');
            }
            program.option(
                '-o <format>',
                `Output format (${(options.outputModes || ['json', 'table', 'quiet']).join(', ')}, routine-step, curl, curl-with-creds)`,
            );
            program.option('--dry-run', 'Preview the API request without executing');

            // 3. Register built-in commands
            registerSetupCommand(program, cliName, {
                allowedCidrs: options.allowedCidrs,
                configPath: options.configPath,
            });
            registerConfigCommand(program, cliName, {
                configPath: options.configPath,
                knownSites: options.knownSites,
                allowedCidrs: options.allowedCidrs,
            });
            registerGenerateCommand(program, cliName, options.specPath, generatedDir, configOpts);
            registerUpgradeCommand(program, options.version);
            registerMcpCommand(
                program,
                cliName,
                resolve(options.generatedDir || 'src/generated'),
                join(homedir(), '.' + options.name, 'routines'),
            );
            registerPluginCommand(program, cliName, options.version);

            // 4. Resolve auth
            let resolved = resolveAuth(cliName, configOpts);

            const cmd = process.argv[2];
            const skipAuthCommands = new Set([
                'login',
                'setup',
                'config',
                'routine',
                'generate',
                'upgrade',
                'mcp',
                'plugin',
            ]);
            const isHelpOrVersion = cmd === '--help' || cmd === '-h'
                || cmd === '--version' || cmd === '-V'
                || process.argv.includes('--help') || process.argv.includes('-h');
            if (
                !resolved
                && process.stdin.isTTY
                && cmd
                && !skipAuthCommands.has(cmd)
                && !isHelpOrVersion
            ) {
                console.log(`${cliName} Setup\n`);
                const envName = await prompt('Environment name [default]: ', 'default');
                const url = await prompt('URL [http://localhost:8080]: ', 'http://localhost:8080');
                const user = await prompt('Username/Email: ');
                const password = await hiddenPrompt('Password: ');
                if (user && password) {
                    const result = await setupAction({
                        cliName, envName, url, user, password,
                        verify: verifyCredentials,
                        save: saveEnvironment,
                        saveOpts: configOpts ?? {},
                    });
                    if (!result.verified) {
                        console.error(result.verifyReason);
                        console.error("Credentials saved anyway — they'll be used when the server is available.");
                    } else {
                        console.log('Credentials verified.');
                    }
                    console.log(`Saved environment '${envName}' to ~/.${cliName}/config.json`);
                    console.log(`Switched to '${envName}'\n`);
                }
                resolved = resolveAuth(cliName, configOpts);
            }

            // 5 + 6. Create session and build CliContext
            let ctx: CliContext | null = null;

            if (resolved) {
                try {
                    const sessionMgr = new SessionManager(cliName);
                    const session = await sessionMgr.resolve(
                        options.auth,
                        resolved,
                    );

                    ctx = {
                        client: null,
                        session,
                        auth: resolved,
                        strategy: options.auth,
                        refreshSession: async () => {
                            sessionMgr.invalidate();
                            const newSession = await sessionMgr.resolve(
                                options.auth,
                                resolved!,
                            );
                            ctx!.session = newSession;
                        },
                    };

                    // 7. Register generated commands — try to import from consumer's generated dir
                    try {
                        const commandsModule = await import(
                            resolve(generatedDir, 'commands'),
                        );
                        if (commandsModule.registerGeneratedCommands) {
                            const { ApiClient } = await import(
                                resolve(generatedDir, 'client'),
                            );
                            const client = new ApiClient(
                                resolved.baseUrl,
                                () => ctx!.session.headers,
                            );
                            ctx.client = client;

                            // Detect request-preview output modes
                            const oIdx = process.argv.indexOf('-o');
                            const oVal = oIdx >= 0 ? process.argv[oIdx + 1] : undefined;
                            const isDryRun = process.argv.includes('--dry-run') && process.argv[2] !== 'routine';
                            const isCurl = oVal === 'curl';
                            const isCurlWithCreds = oVal === 'curl-with-creds';
                            const isRequestPreview = isDryRun || isCurl || isCurlWithCreds;

                            if (isRequestPreview) {
                                client.dryRun = true;
                            }

                            const onResult = (result: unknown) => {
                                if (result === undefined) return;

                                // Handle request preview modes
                                if (isRequestPreview && result && typeof result === 'object' && 'method' in result && 'url' in result) {
                                    const captured = result as CapturedRequest;
                                    if (isCurl) {
                                        console.log(formatCurl(captured, { includeCreds: false }));
                                    } else if (isCurlWithCreds) {
                                        console.log(formatCurl(captured, { includeCreds: true }));
                                    } else {
                                        console.log(formatDryRun(captured));
                                    }
                                    return;
                                }

                                const mode: OutputMode = program.opts().table
                                    ? 'table'
                                    : program.opts().quiet
                                        ? 'quiet'
                                        : 'json';
                                const output = formatOutput(result, mode);
                                if (output) console.log(output);
                            };

                            commandsModule.registerGeneratedCommands(
                                program,
                                client,
                                onResult,
                            );
                        }
                    } catch {
                        // Generated commands not available — consumer hasn't run `generate` yet
                    }

                    // 8. Register consumer commands
                    for (const { registrar } of consumerCommands) {
                        registrar(program, ctx);
                    }
                } catch {
                    // Auth/session failed — only setup/login will work
                }
            }

            // 8b. Register consumer commands (even without auth, so help text is available)
            if (!ctx) {
                for (const { registrar } of consumerCommands) {
                    registrar(program, null as unknown as CliContext);
                }
            }

            // 9. Build dispatcher
            let commandMap:
                | Record<
                    string,
                    {
                        operationId: string;
                        pathParams: string[];
                        queryParams: string[];
                        hasBody: boolean;
                    }
                >
                | undefined;
            try {
                const mapModule = await import(
                    resolve(generatedDir, 'command-map'),
                );
                commandMap = mapModule.commandMap;
            } catch {
                // No command-map available
            }

            // Only build dispatcher if we have a context
            let dispatch: CommandDispatcher | undefined;
            if (ctx) {
                dispatch = buildDispatcher({
                    commandMap,
                    client: ctx.client,
                    consumerHandlers: consumerDispatchers.size > 0 ? consumerDispatchers : undefined,
                    preDispatch: options.preDispatch,
                    ctx,
                    routinesDir,
                    builtinsMap: options.builtinRoutinesDir
                        ? loadBuiltinRoutines(options.builtinRoutinesDir)
                        : undefined,
                });
            }

            // 10. Register routine commands
            registerRoutineCommand(program, cliName, routinesDir, dispatch, options.builtinRoutinesDir);

            // 11. Handle -o routine-step
            const isRoutineStep
                = process.argv.includes('-o')
                    && process.argv[process.argv.indexOf('-o') + 1] === 'routine-step';
            if (isRoutineStep) {
                program.hook('preAction', (_thisCommand, actionCommand) => {
                    const cmdParts: string[] = [];
                    let cmd: any = actionCommand;
                    while (cmd.parent && cmd.parent !== program) {
                        cmdParts.unshift(cmd.name());
                        cmd = cmd.parent;
                    }
                    cmdParts.unshift(cmd.name());
                    const commandPath = cmdParts.join(' ');

                    // Get provided values
                    const opts = actionCommand.opts();
                    const providedArgs: Record<string, unknown> = {};
                    for (const [key, val] of Object.entries(opts)) {
                        if (val !== undefined && key !== 'output') {
                            providedArgs[`--${key}`] = val;
                        }
                    }

                    // Build output lines manually for comment support
                    const positional = actionCommand.args || [];
                    const lines: string[] = [];
                    lines.push(`- name: ${cmdParts[cmdParts.length - 1]}`);
                    lines.push(`  command: ${commandPath}`);

                    // Get all options from the command definition
                    const allOptions = (actionCommand as any).options || [];
                    const skipFlags = new Set([
                        '-o',
                        '-V',
                    ]);
                    const isVerbose = process.argv.includes('-V');

                    if (
                        allOptions.length > 0
                        || Object.keys(providedArgs).length > 0
                    ) {
                        lines.push('  args:');
                        const emitted = new Set<string>();

                        // Provided args first (uncommented)
                        for (const [flag, val] of Object.entries(providedArgs)) {
                            if (skipFlags.has(flag)) continue;
                            lines.push(`    ${flag}: ${JSON.stringify(val)}`);
                            emitted.add(flag);
                        }

                        // Remaining options as commented-out
                        for (const opt of allOptions) {
                            const flag = opt.long || opt.short;
                            if (!flag || skipFlags.has(flag) || emitted.has(flag))
                                continue;
                            // Skip hidden (variant-specific) options unless -V
                            if (opt.hidden && !isVerbose) continue;
                            const desc = opt.description || '';
                            lines.push(
                                `    # ${flag}: "" # optional — ${desc}`,
                            );
                        }
                    }

                    if (positional.length > 0) {
                        lines.push('  args-positional:');
                        for (const p of positional)
                            lines.push(`    - ${JSON.stringify(p)}`);
                    }

                    console.log(lines.join('\n'));
                    process.exit(0);
                });
            }

            // 12. Custom help — intercept no-args and --help
            const userArgs = process.argv.slice(2);
            if (
                userArgs.length === 0
                || (userArgs.length === 1
                    && (userArgs[0] === '--help' || userArgs[0] === '-h'))
            ) {
                const showAll
                    = userArgs[0] === '--help' || userArgs[0] === '-h';
                showCustomHelp(program, cliName, showAll);
                process.exit(0);
            }

            // 13. Parse and execute
            await program.parseAsync();
        },
    };

    return cli;
}
