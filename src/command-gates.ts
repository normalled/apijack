import type { DisableableCommand } from './types';

/** Which optional built-ins are on. `plugin` registers the MCP server, so turning off `mcp` turns it off too. */
export function commandGates(disable: readonly DisableableCommand[] = []): { mcpEnabled: boolean; pluginEnabled: boolean } {
    const mcpEnabled = !disable.includes('mcp');

    return { mcpEnabled, pluginEnabled: mcpEnabled && !disable.includes('plugin') };
}
