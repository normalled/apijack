import { describe, test, expect, mock } from "bun:test";
import { mcpAction } from "./mcp";

describe("mcpAction", () => {
  test("calls startMcpServer with correct params", async () => {
    const startFn = mock(() => Promise.resolve());
    await mcpAction({
      cliName: "testcli",
      cliInvocation: ["node", "testcli"],
      generatedDir: "/tmp/generated",
      routinesDir: "/tmp/routines",
      startMcpServer: startFn,
    });

    expect(startFn).toHaveBeenCalledWith({
      cliName: "testcli",
      cliInvocation: ["node", "testcli"],
      generatedDir: "/tmp/generated",
      routinesDir: "/tmp/routines",
    });
  });

  test("throws MODULE_NOT_FOUND as user-friendly message", () => {
    const err = new Error("Cannot find module");
    expect(mcpAction({
      cliName: "testcli",
      cliInvocation: ["node", "testcli"],
      generatedDir: "/tmp/generated",
      routinesDir: "/tmp/routines",
      startMcpServer: mock(() => Promise.reject(err)),
    })).rejects.toThrow("MCP server requires @modelcontextprotocol/sdk");
  });
});
