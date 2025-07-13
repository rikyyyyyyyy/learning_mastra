import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MCPClient } from '@mastra/mcp';

let mcpClientInstance = null;
const getBraveMCPClient = () => {
  if (mcpClientInstance) {
    console.log("\u267B\uFE0F \u65E2\u5B58\u306EBrave MCP\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u3092\u518D\u5229\u7528");
    return mcpClientInstance;
  }
  console.log("\u{1F527} Brave MCP\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u3092\u521D\u671F\u5316\u4E2D...");
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.error("\u274C BRAVE_API_KEY\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
  } else {
    console.log("\u2705 BRAVE_API_KEY\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059");
  }
  mcpClientInstance = new MCPClient({
    id: "brave-search-mcp",
    // ユニークなIDを設定
    servers: {
      braveSearch: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
        env: {
          BRAVE_API_KEY: apiKey || ""
        }
      }
    }
  });
  console.log("\u2705 Brave MCP\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F");
  return mcpClientInstance;
};

let mcpTools = null;
async function getMCPTools() {
  if (mcpTools) {
    return mcpTools;
  }
  console.log("\u{1F527} MCP\u30C4\u30FC\u30EB\u3092\u521D\u56DE\u53D6\u5F97\u4E2D...");
  const mcpClient = getBraveMCPClient();
  mcpTools = await mcpClient.getTools();
  console.log("\u{1F4E6} \u53D6\u5F97\u3057\u305FMCP\u30C4\u30FC\u30EB:", Object.keys(mcpTools));
  return mcpTools;
}
const braveMCPSearchTool = createTool({
  id: "brave-mcp-search",
  description: "Brave MCP\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3092\u5B9F\u884C\u3057\u307E\u3059",
  inputSchema: z.object({
    query: z.string(),
    count: z.number().optional().default(10)
  }),
  outputSchema: z.object({
    searchResults: z.string(),
    success: z.boolean()
  }),
  execute: async ({ context, mastra, runtimeContext }) => {
    const { query, count } = context;
    try {
      console.log(`\u{1F50D} Brave MCP\u30C4\u30FC\u30EB\u3067Web\u691C\u7D22\u3092\u5B9F\u884C: "${query}"`);
      const tools = await getMCPTools();
      const braveSearchToolName = Object.keys(tools).find(
        (name) => name.includes("brave_web_search")
      );
      if (!braveSearchToolName) {
        console.error("\u274C Brave Web\u691C\u7D22\u30C4\u30FC\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
        console.error("\u5229\u7528\u53EF\u80FD\u306A\u30C4\u30FC\u30EB:", Object.keys(tools));
        return {
          searchResults: JSON.stringify({ error: "Brave Web\u691C\u7D22\u30C4\u30FC\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }),
          success: false
        };
      }
      console.log(`\u{1F527} \u4F7F\u7528\u3059\u308B\u30C4\u30FC\u30EB: ${braveSearchToolName}`);
      const braveSearchTool = tools[braveSearchToolName];
      console.log("\u{1F4DD} \u30C4\u30FC\u30EB\u5B9F\u884C\u30D1\u30E9\u30E1\u30FC\u30BF:", {
        query,
        count
      });
      const searchResult = await braveSearchTool.execute({
        context: {
          query,
          count
        },
        mastra,
        runtimeContext
      });
      console.log("\u2705 Brave MCP\u691C\u7D22\u5B8C\u4E86");
      console.log("\u{1F4CA} \u691C\u7D22\u7D50\u679C:", searchResult);
      console.log("\u{1F4CA} \u691C\u7D22\u7D50\u679C\u306E\u30BF\u30A4\u30D7:", typeof searchResult);
      console.log("\u{1F4CA} \u691C\u7D22\u7D50\u679C\u306E\u30AD\u30FC:", searchResult ? Object.keys(searchResult) : "null");
      let resultString = "";
      if (searchResult && typeof searchResult === "object") {
        if ("content" in searchResult && Array.isArray(searchResult.content)) {
          console.log("\u{1F4CA} content \u914D\u5217:", searchResult.content);
          const firstContent = searchResult.content[0];
          if (firstContent && typeof firstContent === "object" && "text" in firstContent) {
            console.log("\u{1F4CA} text \u30D7\u30ED\u30D1\u30C6\u30A3:", firstContent.text);
            resultString = firstContent.text;
          } else {
            resultString = JSON.stringify(searchResult.content);
          }
        } else if ("result" in searchResult) {
          console.log("\u{1F4CA} result \u30D7\u30ED\u30D1\u30C6\u30A3:", searchResult.result);
          resultString = typeof searchResult.result === "string" ? searchResult.result : JSON.stringify(searchResult.result);
        } else if ("data" in searchResult) {
          console.log("\u{1F4CA} data \u30D7\u30ED\u30D1\u30C6\u30A3:", searchResult.data);
          resultString = typeof searchResult.data === "string" ? searchResult.data : JSON.stringify(searchResult.data);
        } else {
          console.log("\u{1F4CA} \u305D\u306E\u4ED6\u306E\u5F62\u5F0F:", searchResult);
          resultString = JSON.stringify(searchResult);
        }
      } else if (typeof searchResult === "string") {
        resultString = searchResult;
      } else {
        resultString = JSON.stringify(searchResult);
      }
      console.log("\u{1F4CA} \u6700\u7D42\u7684\u306A\u7D50\u679C\u6587\u5B57\u5217:", resultString.substring(0, 200) + "...");
      return {
        searchResults: resultString,
        success: true
      };
    } catch (error) {
      console.error("\u274C Brave MCP\u691C\u7D22\u30A8\u30E9\u30FC:", error);
      console.error("\u30A8\u30E9\u30FC\u306E\u8A73\u7D30:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0
      });
      return {
        searchResults: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
        success: false
      };
    }
  }
});

export { braveMCPSearchTool };
//# sourceMappingURL=f55f74d0-259b-40f7-8cff-7623a7a76009.mjs.map
