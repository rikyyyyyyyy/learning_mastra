import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getExaMCPClient } from '../mcp/exa-mcp-client';

// MCPツールを取得してキャッシュ
interface MCPTool {
  execute: (params: {
    context: Record<string, unknown>;
    mastra?: unknown;
    runtimeContext?: unknown;
  }) => Promise<unknown>;
}

let mcpTools: Record<string, MCPTool> | null = null;

async function getMCPTools() {
  if (mcpTools) {
    return mcpTools;
  }
  
  console.log('🔧 Exa MCPツールを初回取得中...');
  const mcpClient = getExaMCPClient();
  mcpTools = await mcpClient.getTools();
  console.log('📦 取得したExa MCPツール:', Object.keys(mcpTools));
  
  return mcpTools;
}

// Exa MCPツールをMastraツールとしてラップ
export const exaMCPSearchTool = createTool({
  id: 'exa-mcp-search',
  description: 'Exa MCPを使用して高度なWeb検索を実行します',
  inputSchema: z.object({
    query: z.string().describe('検索クエリ'),
    numResults: z.number().optional().default(10).describe('取得する結果の数'),
    searchType: z.enum(['web', 'research_paper', 'github', 'company', 'linkedin', 'wikipedia']).optional().default('web').describe('検索タイプ'),
  }),
  outputSchema: z.object({
    searchResults: z.string(),
    success: z.boolean(),
    toolUsed: z.string().optional(),
  }),
  execute: async ({ context, mastra, runtimeContext }) => {
    const { query, numResults, searchType } = context;
    
    try {
      console.log(`🔍 Exa MCPツールで${searchType}検索を実行: "${query}"`);
      
      // MCPツールを取得
      const tools = await getMCPTools();
      
      // 検索タイプに基づいてツールを選択
      let targetToolName: string | undefined;
      
      switch (searchType) {
        case 'web':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('web_search_exa') && !name.includes('wikipedia')
          );
          break;
        case 'research_paper':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('research_paper_search')
          );
          break;
        case 'github':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('github_search')
          );
          break;
        case 'company':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('company_research')
          );
          break;
        case 'linkedin':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('linkedin_search')
          );
          break;
        case 'wikipedia':
          targetToolName = Object.keys(tools).find(name => 
            name.includes('wikipedia_search_exa')
          );
          break;
      }
      
      if (!targetToolName) {
        console.error(`❌ Exa ${searchType}検索ツールが見つかりません`);
        console.error('利用可能なツール:', Object.keys(tools));
        return {
          searchResults: JSON.stringify({ error: `Exa ${searchType}検索ツールが見つかりません` }),
          success: false,
        };
      }
      
      console.log(`🔧 使用するツール: ${targetToolName}`);
      const searchTool = tools[targetToolName];
      
      // Mastraツールとして実行
      console.log('📝 ツール実行パラメータ:', {
        query,
        numResults,
        searchType,
      });
      
      // Exaツールのパラメータ名に合わせて調整
      const toolParams: Record<string, unknown> = {
        query,
      };
      
      // numResultsパラメータ名の調整（ツールによって異なる可能性）
      if (searchType === 'web') {
        toolParams.num_results = numResults;
      } else {
        toolParams.numResults = numResults;
      }
      
      const searchResult = await searchTool.execute({
        context: toolParams,
        mastra,
        runtimeContext,
      });
      
      console.log('✅ Exa MCP検索完了');
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
        toolUsed: targetToolName,
      };
    } catch (error) {
      console.error('❌ Exa MCP検索エラー:', error);
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