import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MCPClient } from '@mastra/mcp';

export type CustomMCPServer = {
  id: string;
  kind: 'remote' | 'local';
  url?: string; // for remote
  command?: string; // for local
  args?: string; // space-separated list (optional)
};

export function createCustomMCPTool(servers: CustomMCPServer[]) {
  const serverConfig: Record<string, unknown> = {};
  for (const s of servers || []) {
    if (!s?.id) continue;
    if (s.kind === 'remote' && s.url) {
      try {
        serverConfig[s.id] = { url: new URL(s.url) };
      } catch {}
    } else if (s.kind === 'local' && s.command) {
      serverConfig[s.id] = { command: s.command, args: s.args ? s.args.split(' ').filter(Boolean) : [] };
    }
  }

  const hasServers = Object.keys(serverConfig).length > 0;
  return createTool({
    id: 'custom-mcp-invoke',
    description: 'Configured MCP servers: invoke a tool by server and name with params (JSON object input only).',
    inputSchema: z.object({
      serverId: z.string().describe('MCP server ID configured for this worker'),
      toolName: z.string().describe('Tool name exposed by the MCP server'),
      params: z.record(z.unknown()).default({}).describe('JSON parameters for the tool'),
    }),
    outputSchema: z.object({ success: z.boolean(), result: z.any() }),
    execute: async ({ context }) => {
      if (!hasServers) return { success: false, result: { error: 'No MCP servers configured' } };
      const { serverId, toolName, params } = context as { serverId: string; toolName: string; params: Record<string, unknown> };
      if (!serverId || !toolName) return { success: false, result: { error: 'serverId and toolName are required' } };
      if (!serverConfig[serverId]) return { success: false, result: { error: `Unknown serverId: ${serverId}` } };

      const mcp = new MCPClient({ id: 'custom-mcp', servers: { [serverId]: serverConfig[serverId] as unknown } });
      const tools = await mcp.getTools();
      const tool = tools[toolName];
      if (!tool) return { success: false, result: { error: `Tool not found: ${toolName}` } };
      const result = await tool.execute({ context: params });
      return { success: true, result };
    },
  });
}
