import { agentLogStore, formatAgentMessage } from './agent-log-store';

// Agentの型定義（@mastra/coreからのインポートを避けるため）
interface Agent {
  stream: (prompt: string, options?: any) => Promise<any>;
  generate?: (prompt: string, options?: any) => Promise<any>;
  [key: string]: any;
}

// エージェントをラップして会話をキャプチャ
export function wrapAgentForLogging(
  agent: Agent,
  agentId: string,
  agentName: string,
  jobId: string
): Agent {
  console.log(`🎭 エージェントラッパー作成: ${agentId} (${agentName}) - jobId: ${jobId}`);
  
  // 元のstreamメソッドを保存
  const originalStream = agent.stream.bind(agent);
  const originalGenerate = agent.generate ? agent.generate.bind(agent) : undefined;
  
  let iterationCounter = 0;
  
  // streamメソッドをオーバーライド
  const wrappedStream = async function(prompt: string, options?: any) {
    iterationCounter++;
    console.log(`🎯 [${agentId}] stream呼び出し検出！ - iteration: ${iterationCounter} - jobId: ${jobId}`);
    console.log(`🎯 [${agentId}] プロンプト: ${prompt.substring(0, 100)}...`);
    console.log(`🎯 [${agentId}] 呼び出し元:`, new Error().stack?.split('\n')[2]);
    
    // リクエストをログに記録
    const requestEntry = formatAgentMessage(
      agentId,
      agentName,
      prompt,
      iterationCounter,
      'request'
    );
    console.log(`🎯 [${agentId}] ログストアに送信中...`);
    agentLogStore.addLogEntry(jobId, requestEntry);
    
    // 元のstreamメソッドを呼び出し
    const stream = await originalStream(prompt, options);
    
    // ストリームの内容をキャプチャしながら返す
    let responseText = '';
    const wrappedStream = {
      ...stream,
      fullStream: (async function* () {
        console.log(`🎯 [${agentId}] ストリーム開始`);
        
        try {
          for await (const chunk of stream.fullStream) {
            // チャンクをそのまま返す
            yield chunk;
            
            // テキストチャンクをキャプチャ
            if (chunk.type === 'text-delta') {
              responseText += chunk.textDelta || '';
            } else if (chunk.type === 'text') {
              responseText += chunk.text || '';
            }
          }
          
          // レスポンスをログに記録
          if (responseText) {
            console.log(`🎯 [${agentId}] レスポンス: ${responseText.substring(0, 100)}...`);
            const responseEntry = formatAgentMessage(
              agentId,
              agentName,
              responseText,
              iterationCounter,
              'response',
              {
                model: (agent as any)._modelInfo?.modelId,
              }
            );
            agentLogStore.addLogEntry(jobId, responseEntry);
          }
        } catch (error) {
          console.error(`❌ [${agentId}] ストリームエラー:`, error);
          throw error;
        }
      })(),
    };
    
    return wrappedStream;
  };
  
  agent.stream = wrappedStream;
  
  // generateメソッドもオーバーライド（存在する場合）
  if (originalGenerate) {
    agent.generate = async function(prompt: string, options?: any) {
      iterationCounter++;
      console.log(`🎯 [${agentId}] generate呼び出し - iteration: ${iterationCounter}`);
      
      // リクエストをログに記録
      const requestEntry = formatAgentMessage(
        agentId,
        agentName,
        prompt,
        iterationCounter,
        'request'
      );
      agentLogStore.addLogEntry(jobId, requestEntry);
      
      // 元のgenerateメソッドを呼び出し
      const result = await originalGenerate!(prompt, options);
      
      // レスポンスをログに記録
      const responseText = result.text || JSON.stringify(result);
      const responseEntry = formatAgentMessage(
        agentId,
        agentName,
        responseText,
        iterationCounter,
        'response',
        {
          model: (agent as any)._modelInfo?.modelId,
        }
      );
      agentLogStore.addLogEntry(jobId, responseEntry);
      
      return result;
    };
  }
  
  return agent;
}