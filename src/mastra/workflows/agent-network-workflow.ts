import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { anthropic } from '@ai-sdk/anthropic';

// 入力スキーマ
const inputSchema = z.object({
  taskType: z.string(),
  taskDescription: z.string(),
  taskParameters: z.any(),
  jobId: z.string().optional(), // ジョブIDを追加
  context: z.object({
    priority: z.enum(['low', 'medium', 'high']).optional(),
    constraints: z.any().optional(),
    expectedOutput: z.string().optional(),
    additionalInstructions: z.string().optional(),
  }).optional(),
});

// 会話ログの型定義
const conversationEntrySchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  message: z.string(),
  timestamp: z.string(),
  iteration: z.number(),
  messageType: z.enum(['request', 'response', 'internal']).optional(),
  metadata: z.object({
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    tokenCount: z.number().optional(),
    executionTime: z.number().optional(),
  }).optional(),
});

// 出力スキーマ
const outputSchema = z.object({
  success: z.boolean(),
  taskType: z.string(),
  result: z.any(),
  executionSummary: z.object({
    totalIterations: z.number(),
    agentsInvolved: z.array(z.string()),
    executionTime: z.string(),
  }).optional(),
  conversationHistory: z.array(conversationEntrySchema).optional(),
  error: z.string().optional(),
});

// エージェントネットワーク実行ステップ
const agentNetworkStep = createStep({
  id: 'agent-network-execution',
  description: 'Execute task through CEO-Manager-Worker agent network',
  inputSchema,
  outputSchema,
  execute: async ({ inputData, runtimeContext, mastra }) => {
    const startTime = Date.now();
    
    // ジョブIDを生成または使用
    const jobId = inputData.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    try {
      console.log('🌐 エージェントネットワークワークフロー開始:', {
        jobId,
        taskType: inputData.taskType,
        hasRuntimeContext: !!runtimeContext,
        timestamp: new Date().toISOString(),
      });

      // Mastraインスタンスが利用可能か確認
      if (!mastra) {
        throw new Error('Mastraインスタンスが利用できません');
      }

      // エージェントを取得
      const ceoAgentOriginal = mastra.getAgent('ceo-agent');
      const managerAgentOriginal = mastra.getAgent('manager-agent');
      const workerAgentOriginal = mastra.getAgent('worker-agent');

      if (!ceoAgentOriginal || !managerAgentOriginal || !workerAgentOriginal) {
        throw new Error('必要なエージェントが見つかりません');
      }
      
      // エージェントをそのまま使用（watch-v2イベントでログを取得）
      const ceoAgent = ceoAgentOriginal;
      const managerAgent = managerAgentOriginal;
      const workerAgent = workerAgentOriginal;

      // メモリ設定を準備
      const resourceId = runtimeContext?.get('resourceId') as string | undefined;
      const threadId = runtimeContext?.get('threadId') as string | undefined;
      const memoryConfig = resourceId && threadId ? {
        resource: resourceId,
        thread: threadId,
      } : undefined;

      // メモリを取得（会話履歴を追跡するため）
      const memory = memoryConfig ? mastra?.getMemory() : undefined;
      
      // エージェントネットワークを作成
      const agentNetwork = new NewAgentNetwork({
        id: 'task-execution-network',
        name: 'Task Execution Network',
        instructions: `Coordinate task execution through CEO-Manager-Worker hierarchy. The network automatically routes between agents based on the conversation flow.
        
IMPORTANT ROUTING RULES:
- CEO provides strategic direction ONCE then stops
- Manager creates execution plan ONCE then waits for Worker
- Worker executes task ONCE and signals completion
- When task is marked complete (✅/❌/⚠️), terminate the loop`,
        model: anthropic('claude-sonnet-4-20250514'),
        agents: {
          'ceo': ceoAgent,
          'manager': managerAgent,
          'worker': workerAgent,
        },
        defaultAgent: ceoAgent,
        memory: memory,
      });

      // タスクコンテキストを準備
      // taskParametersが文字列の場合はパースする
      let parsedParameters = inputData.taskParameters;
      if (typeof inputData.taskParameters === 'string') {
        try {
          parsedParameters = JSON.parse(inputData.taskParameters);
        } catch (e) {
          // パースできない場合はそのまま使用
          console.warn('taskParametersのパースに失敗しました:', e);
        }
      }

      const networkPrompt = `
Execute the following task:
Type: ${inputData.taskType}
Description: ${inputData.taskDescription}
Parameters: ${JSON.stringify(parsedParameters, null, 2)}
${inputData.context?.expectedOutput ? `Expected Output: ${inputData.context.expectedOutput}` : ''}
${inputData.context?.constraints ? `Constraints: ${JSON.stringify(inputData.context.constraints)}` : ''}
${inputData.context?.additionalInstructions ? `Additional Instructions: ${inputData.context.additionalInstructions}` : ''}

Priority: ${inputData.context?.priority || 'medium'}

As the CEO agent, analyze this task and provide strategic direction. The agent network will automatically route your guidance to the appropriate agents for planning and execution.
`;

      console.log('🎯 ネットワークプロンプト:', networkPrompt);

      // 会話履歴は不要（watch-v2イベントで取得）

      // エージェントネットワークを実行
      console.log('🔄 エージェントネットワーク実行開始...');
      console.log('📊 設定: maxIterations=10, defaultAgent=CEO');
      console.log('📋 エージェント:');
      console.log('  - CEO: 戦略的指示 (1回のみ応答)');
      console.log('  - Manager: 実行計画作成 (1回のみ)');
      console.log('  - Worker: タスク実行と完了シグナル');
      console.log('🔍 ログ記録: watch-v2イベント経由');

      // カスタムオプションでエージェントネットワークのloopメソッドを実行
      const networkOptions = {
        maxIterations: 10, // 最大10回のエージェント間やり取り
        // デバッグモードを環境変数で制御
        debug: process.env.AGENT_NETWORK_DEBUG === 'true',
        // ストリーミングを有効化して中間結果をキャプチャ
        stream: true,
      };
      
      console.log('🚀 エージェントネットワーク実行オプション:', networkOptions);
      
      // ネットワーク実行前のタイムスタンプ
      const networkStartTime = Date.now();
      
      let result;
      let conversationHistory: any[] = [];
      let iterationCounter = 0;
      
      // jobIdをコンテキストに追加（エージェントがアクセスできるように）
      if (runtimeContext && jobId) {
        runtimeContext.set('currentJobId', jobId);
        runtimeContext.set('taskType', inputData.taskType);
      }

      try {
        // エージェントネットワークのloopメソッドを実行
        console.log(`🎯 NewAgentNetwork.loop実行開始 - jobId: ${jobId}`);
        console.log(`🎯 JobIdをruntimeContextに設定: ${jobId}`);
        
        result = await agentNetwork.loop(
          networkPrompt,
          networkOptions
        );
        
        console.log(`🎯 NewAgentNetwork.loop実行完了`);
        console.log(`🎯 結果の型:`, typeof result);
        console.log(`🎯 結果のキー:`, result ? Object.keys(result) : 'null');
        
        // メモリから会話履歴を取得してログストアに送信
        if (memory && memoryConfig) {
          try {
            console.log(`📜 メモリから会話履歴を取得中...`);
            const messages = await memory.getMessages({
              resourceId: memoryConfig.resource,
              threadId: memoryConfig.thread,
            });
            
            console.log(`📜 取得したメッセージ数: ${messages.length}`);
            
            // ログストアをインポート（動的インポートで循環依存を回避）
            let agentLogStore: any;
            let formatAgentMessage: any;
            try {
              const logModule = await import('../utils/agent-log-store');
              agentLogStore = logModule.agentLogStore;
              formatAgentMessage = logModule.formatAgentMessage;
            } catch (error) {
              console.error('❌ agentLogStoreのインポートエラー:', error);
            }
            
            // ログストアが利用可能な場合、メッセージを送信
            if (agentLogStore && jobId) {
              // ジョブが存在しない場合は作成
              const jobLog = agentLogStore.getJobLog(jobId);
              if (!jobLog) {
                agentLogStore.createJob(jobId, inputData.taskType);
              }
              
              // メッセージをエージェントごとに分類して送信
              messages.forEach((msg: any, index: number) => {
                console.log(`📩 メッセージ ${index + 1}:`, {
                  role: msg.role,
                  content: msg.content?.substring(0, 50) + '...',
                  metadata: msg.metadata,
                });
                
                // エージェントIDを推定
                let agentId = 'system';
                let agentName = 'System';
                
                if (msg.metadata?.agentId) {
                  agentId = msg.metadata.agentId;
                  agentName = msg.metadata.agentName || agentId;
                } else if (msg.content) {
                  // コンテンツからエージェントを推定
                  const content = msg.content.toLowerCase();
                  if (content.includes('ceo') || content.includes('strategic')) {
                    agentId = 'ceo';
                    agentName = 'CEO Agent';
                  } else if (content.includes('manager') || content.includes('plan')) {
                    agentId = 'manager';
                    agentName = 'Manager Agent';
                  } else if (content.includes('worker') || content.includes('execute')) {
                    agentId = 'worker';
                    agentName = 'Worker Agent';
                  }
                }
                
                const conversationEntry = formatAgentMessage(
                  agentId,
                  agentName,
                  msg.content || '',
                  index + 1,
                  msg.role === 'user' ? 'request' : 'response',
                  {
                    model: msg.metadata?.model,
                    timestamp: msg.createdAt,
                  }
                );
                
                agentLogStore.addLogEntry(jobId, conversationEntry);
                conversationHistory.push(conversationEntry);
              });
              
              console.log(`✅ ${messages.length}件のメッセージをログストアに送信しました`);
            }
          } catch (error) {
            console.error('❌ メモリから会話履歴の取得エラー:', error);
          }
        }
        
        // 結果から会話履歴を抽出（もし含まれている場合）
        if (result && typeof result === 'object') {
          if (result.conversationHistory) {
            conversationHistory = result.conversationHistory;
            console.log(`📜 会話履歴を結果から抽出: ${conversationHistory.length}件`);
          } else if (result.messages) {
            conversationHistory = result.messages;
            console.log(`📜 メッセージを結果から抽出: ${conversationHistory.length}件`);
          }
        }
        
      } catch (error) {
        console.error('❌ NewAgentNetwork.loop実行エラー:', error);
        throw error;
      }
      
      const networkExecutionTime = Date.now() - networkStartTime;
      console.log(`⏱️ ネットワーク実行時間: ${(networkExecutionTime / 1000).toFixed(2)}秒`);
      
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('✅ エージェントネットワーク実行完了:', {
        taskType: inputData.taskType,
        executionTime: `${executionTime}s`,
      });
      
      // 実行サマリーを作成
      const executionSummary = {
        totalIterations: 3, // CEO -> Manager -> Worker
        agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
        executionTime: `${executionTime}s`,
      };
      
      // 結果を整形
      return {
        success: true,
        taskType: inputData.taskType,
        result: result.result?.text || result,
        executionSummary,
        conversationHistory: [], // エージェントラッパーが直接ログストアに送信しているため
      };

    } catch (error) {
      console.error('❌ エージェントネットワークエラー:', error);
      
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);

      return {
        success: false,
        taskType: inputData.taskType,
        result: null,
        executionSummary: {
          totalIterations: 0,
          agentsInvolved: [],
          executionTime: `${executionTime}s`,
        },
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

// ワークフローを作成
export const agentNetworkWorkflow = createWorkflow({
  id: 'agent-network-workflow',
  description: 'Executes any task through a hierarchical CEO-Manager-Worker agent network',
  inputSchema,
  outputSchema,
})
  .then(agentNetworkStep)
  .commit();

// ワークフローをデフォルトエクスポート
export default agentNetworkWorkflow;