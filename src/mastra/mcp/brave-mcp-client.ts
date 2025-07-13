import { MCPClient } from '@mastra/mcp';

// シングルトンインスタンス
let mcpClientInstance: MCPClient | null = null;

// Brave MCPクライアントの設定
export const getBraveMCPClient = () => {
  // 既存のインスタンスがあればそれを返す
  if (mcpClientInstance) {
    console.log('♻️ 既存のBrave MCPクライアントを再利用');
    return mcpClientInstance;
  }
  
  console.log('🔧 Brave MCPクライアントを初期化中...');
  
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.error('❌ BRAVE_API_KEYが設定されていません');
  } else {
    console.log('✅ BRAVE_API_KEYが設定されています');
  }
  
  // 新しいインスタンスを作成
  mcpClientInstance = new MCPClient({
    id: 'brave-search-mcp', // ユニークなIDを設定
    servers: {
      braveSearch: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {
          BRAVE_API_KEY: apiKey || '',
        },
      },
    },
  });
  
  console.log('✅ Brave MCPクライアントを作成しました');
  
  return mcpClientInstance;
};

// クライアントをリセットする関数（必要に応じて）
export const resetBraveMCPClient = async () => {
  if (mcpClientInstance) {
    console.log('🔌 既存のMCPクライアントを切断中...');
    await mcpClientInstance.disconnect();
    mcpClientInstance = null;
  }
}; 