import { Command } from 'commander';

export interface McpInput {
    cliName: string;
    cliInvocation: string[];
    /** Pins the server: a leading `--config <name>` on every CLI process it spawns, and the in-process tools' environment. */
    environment?: string;
    /** The config.json the in-process tools read and write. */
    configPath?: string;
    generatedDir: string;
    routinesDir: string;
    startMcpServer: (opts: {
        cliName: string;
        cliInvocation: string[];
        environment?: string;
        configPath?: string;
        generatedDir: string;
        routinesDir: string;
    }) => Promise<void>;
}

export async function mcpAction(input: McpInput): Promise<void> {
    try {
        await input.startMcpServer({
            cliName: input.cliName,
            cliInvocation: input.environment === undefined
                ? input.cliInvocation
                : [...input.cliInvocation, '--config', input.environment],
            environment: input.environment,
            configPath: input.configPath,
            generatedDir: input.generatedDir,
            routinesDir: input.routinesDir,
        });
    } catch (e: unknown) {
        if (
            e instanceof Error && (
                (e as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
                || e.message.includes('Cannot find module')
                || e.message.includes('Failed to resolve')
            )
        ) {
            throw new Error('MCP server requires @modelcontextprotocol/sdk');
        }

        throw e;
    }
}

export function registerMcpCommand(
    program: Command,
    cliName: string,
    generatedDir: string,
    routinesDir: string,
    opts?: {
        /** Read when the command runs, so it sees a `--config` taken from argv after registration. */
        environment?: () => string | undefined;
        configPath?: string;
    },
): void {
    program
        .command('mcp')
        .description('Start MCP server for AI agent integration')
        .action(async () => {
            try {
                const { startMcpServer } = await import('../../mcp/server');
                await mcpAction({
                    cliName,
                    cliInvocation: process.argv.slice(0, 2),
                    environment: opts?.environment?.(),
                    configPath: opts?.configPath,
                    generatedDir,
                    routinesDir,
                    startMcpServer,
                });
            } catch (err) {
                console.error(err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });
}
