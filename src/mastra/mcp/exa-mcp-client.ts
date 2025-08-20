import { MCPClient } from '@mastra/mcp';

// MCPクライアントのシングルトンインスタンス
let mcpClient: MCPClient | null = null;

/**
 * Exa MCP クライアントを取得
 * リモートMCPサーバーに接続します
 * @returns MCPClient インスタンス
 */
export const getExaMCPClient = () => {
  if (mcpClient) {
    console.log('📦 既存のExa MCPクライアントを使用');
    return mcpClient;
  }

  const exaApiKey = process.env.EXA_API_KEY;
  
  if (!exaApiKey) {
    console.error('❌ EXA_API_KEY環境変数が設定されていません');
    throw new Error('EXA_API_KEY is not set in environment variables');
  }

  console.log('🔧 新しいExa MCPクライアントを作成中...');
  
  try {
    mcpClient = new MCPClient({
      id: 'exa-search-mcp',
      servers: {
        exaSearch: {
          // Exaの公式リモートMCPサーバーURL
          url: new URL(`https://mcp.exa.ai/mcp?exaApiKey=${exaApiKey}`),
          // Optional: リクエストヘッダーなどの追加設定
          requestInit: {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        },
      },
    });

    console.log('✅ Exa MCPクライアントが正常に作成されました');
    console.log('🌐 リモートサーバー接続: https://mcp.exa.ai/');
    
    return mcpClient;
  } catch (error) {
    console.error('❌ Exa MCPクライアントの作成に失敗しました:', error);
    throw error;
  }
};

/**
 * MCPクライアントをクリーンアップ
 * テストやリセット時に使用
 */
export const clearExaMCPClient = () => {
  mcpClient = null;
  console.log('🧹 Exa MCPクライアントがクリアされました');
};