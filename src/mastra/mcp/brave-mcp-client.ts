import { MCPClient } from '@mastra/mcp';

// Brave MCPクライアントの設定
export const getBraveMCPClient = () => {
  return new MCPClient({
    servers: {
      braveSearch: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {
          BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
        },
      },
    },
  });
}; 