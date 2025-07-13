import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getBraveMCPClient } from '../mcp/brave-mcp-client';

// MCPツールを取得してキャッシュ
let mcpTools: Record<string, any> | null = null;

async function getMCPTools() {
  if (mcpTools) {
    return mcpTools;
  }
  
  console.log('🔧 MCPツールを初回取得中...');
  const mcpClient = getBraveMCPClient();
  mcpTools = await mcpClient.getTools();
  console.log('📦 取得したMCPツール:', Object.keys(mcpTools));
  
  return mcpTools;
}

// Brave MCPツールをMastraツールとしてラップ
export const braveMCPSearchTool = createTool({
  id: 'brave-mcp-search',
  description: 'Brave MCPを使用してWeb検索を実行します',
  inputSchema: z.object({
    query: z.string(),
    count: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    searchResults: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ context, mastra, runtimeContext }) => {
    const { query, count } = context;
    
    try {
      console.log(`🔍 Brave MCPツールでWeb検索を実行: "${query}"`);
      
      // MCPツールを取得
      const tools = await getMCPTools();
      
      // braveSearch_brave_web_search ツールを探す（MCPClient.getTools()はサーバー名でプレフィックスを付ける）
      const braveSearchToolName = Object.keys(tools).find(name => 
        name.includes('brave_web_search')
      );
      
      if (!braveSearchToolName) {
        console.error('❌ Brave Web検索ツールが見つかりません');
        console.error('利用可能なツール:', Object.keys(tools));
        return {
          searchResults: JSON.stringify({ error: 'Brave Web検索ツールが見つかりません' }),
          success: false,
        };
      }
      
      console.log(`🔧 使用するツール: ${braveSearchToolName}`);
      const braveSearchTool = tools[braveSearchToolName];
      
      // Mastraツールとして実行
      console.log('📝 ツール実行パラメータ:', {
        query,
        count,
      });
      
      const searchResult = await braveSearchTool.execute({
        context: {
          query,
          count,
        },
        mastra,
        runtimeContext,
      });
      
      console.log('✅ Brave MCP検索完了');
      console.log('📊 検索結果:', searchResult);
      console.log('📊 検索結果のタイプ:', typeof searchResult);
      console.log('📊 検索結果のキー:', searchResult ? Object.keys(searchResult) : 'null');
      
      // 検索結果の内容を確認
      let resultString = '';
      if (searchResult && typeof searchResult === 'object') {
        // MCPツールの結果はcontent配列を持つ可能性がある
        if ('content' in searchResult && Array.isArray(searchResult.content)) {
          console.log('📊 content 配列:', searchResult.content);
          // content配列の最初の要素を取得
          const firstContent = searchResult.content[0];
          if (firstContent && typeof firstContent === 'object' && 'text' in firstContent) {
            console.log('📊 text プロパティ:', firstContent.text);
            resultString = firstContent.text;
          } else {
            resultString = JSON.stringify(searchResult.content);
          }
        }
        // resultプロパティがある場合
        else if ('result' in searchResult) {
          console.log('📊 result プロパティ:', searchResult.result);
          resultString = typeof searchResult.result === 'string' 
            ? searchResult.result 
            : JSON.stringify(searchResult.result);
        } 
        // dataプロパティがある場合
        else if ('data' in searchResult) {
          console.log('📊 data プロパティ:', searchResult.data);
          resultString = typeof searchResult.data === 'string' 
            ? searchResult.data 
            : JSON.stringify(searchResult.data);
        }
        // その他の場合
        else {
          console.log('📊 その他の形式:', searchResult);
          resultString = JSON.stringify(searchResult);
        }
      } else if (typeof searchResult === 'string') {
        resultString = searchResult;
      } else {
        resultString = JSON.stringify(searchResult);
      }
      
      console.log('📊 最終的な結果文字列:', resultString.substring(0, 200) + '...');
      
      return {
        searchResults: resultString,
        success: true,
      };
    } catch (error) {
      console.error('❌ Brave MCP検索エラー:', error);
      console.error('エラーの詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        searchResults: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        success: false,
      };
    }
  },
}); 