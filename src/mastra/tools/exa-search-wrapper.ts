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
    if (!process.env.EXA_API_KEY) {
      const msg = 'EXA_API_KEY is not set. Set it in .env.local to enable Exa MCP search.';
      console.error('❌', msg);
      return { searchResults: JSON.stringify({ error: msg }), success: false };
    }
    
    try {
      console.log(`🔍 Exa MCPツールで${searchType}検索を実行: "${query}"`);
      
      // MCPツールを取得
      const tools = await getMCPTools();
      
      // 検索タイプに基づいてツールを選択（名称差異に強い柔軟一致）
      const names = Object.keys(tools);
      const findBy = (re: RegExp, exclude?: RegExp) =>
        names.find((n) => re.test(n) && (!exclude || !exclude.test(n)));

      let targetToolName: string | undefined;
      switch (searchType) {
        case 'web':
          targetToolName =
            findBy(/web.*search|search.*web|exa.*search|search/i, /wiki/i) ||
            findBy(/search/i, /wiki/i);
          break;
        case 'research_paper':
          targetToolName = findBy(/paper|arxiv|research.*paper/i) || findBy(/research/i);
          break;
        case 'github':
          targetToolName = findBy(/github/i);
          break;
        case 'company':
          targetToolName = findBy(/company|crunchbase|clearbit/i) || findBy(/research/i);
          break;
        case 'linkedin':
          targetToolName = findBy(/linkedin/i);
          break;
        case 'wikipedia':
          targetToolName = findBy(/wikipedia|wiki/i);
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
      
      // Exaツールのパラメータ名に合わせて調整（互換キーを同時に渡す）
      const toolParams: Record<string, unknown> = {
        query,
        numResults,
        num_results: numResults,
        count: numResults,
        limit: numResults,
        type: searchType,
      };
      
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
