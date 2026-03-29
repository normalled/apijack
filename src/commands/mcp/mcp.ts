import { Command } from 'commander';
import { resolve } from 'path';
import { homedir } from 'os';

export interface McpInput {
    cliName: string;
    cliInvocation: string[];
    generatedDir: string;
    routinesDir: string;
    startMcpServer: (opts: { cliName: string; cliInvocation: string[]; generatedDir: string; routinesDir: string }) => Promise<void>;
}

export async function mcpAction(input: McpInput): Promise<void> {
    try {
        await input.startMcpServer({
            cliName: input.cliName,
            cliInvocation: input.cliInvocation,
            generatedDir: input.generatedDir,
            routinesDir: input.routinesDir,
        });
    } catch (e: any) {
        if (
            e?.code === 'MODULE_NOT_FOUND'
            || e?.message?.includes('Cannot find module')
            || e?.message?.includes('Failed to resolve')
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
