import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';



// バックグラウンドでワークフローを実行
const executeAgentNetworkWorkflow = async (
  mastraInstance: unknown,
  jobId: string,
  inputData: {
    jobId: string;
    taskType: string;
    taskDescription: string;
    taskParameters: unknown;
    context?: {
      priority?: 'low' | 'medium' | 'high';
      constraints?: unknown;
      expectedOutput?: string;
      additionalInstructions?: string;
    };
  },
  runtimeContext?: unknown
) => {
  // 動的インポートでagentLogStoreを先に取得
  let agentLogStore: any;
  let formatAgentMessage: any;
  
  try {
    const logModule = await import('../utils/agent-log-store');
    agentLogStore = logModule.agentLogStore;
    formatAgentMessage = logModule.formatAgentMessage;
  } catch (error) {
    console.error('❌ agentLogStoreのインポートエラー:', error);
  }
  
  try {
    console.log('🚀 エージェントネットワークワークフローを開始:', {
      jobId,
      taskType: inputData.taskType,
      timestamp: new Date().toISOString()
    });

    // ワークフローを開始
    const mastraTyped = mastraInstance as { 
      getWorkflow: (id: string) => unknown 
    };
    const workflow = mastraTyped.getWorkflow('agent-network-workflow');
    if (!workflow) {
      throw new Error('agent-network-workflowが見つかりません');
    }

    const workflowInstance = workflow as { 
      createRunAsync: (options: { runId: string }) => Promise<{
        start: (options: { inputData: unknown; runtimeContext?: unknown }) => Promise<unknown>;
      }>
    };
    const run = await workflowInstance.createRunAsync({ runId: jobId });

    // ジョブステータスを実行中に更新
    updateJobStatus(jobId, 'running');
    
    // watch-v2イベントを監視してリアルタイムログを記録
    const runTyped = run as {
      start: (options: { inputData: unknown; runtimeContext?: unknown }) => Promise<unknown>;
      watch?: (callback: (event: any) => void, channel?: string) => void;
    };
    
    // ログストアにジョブを作成
    if (agentLogStore) {
      agentLogStore.createJob(jobId, inputData.taskType);
    }
    
    if (runTyped.watch && agentLogStore) {
      console.log('🔍 watch-v2イベントの監視を開始');
      
      let iterationCounter = 0;
      let currentAgentId = '';
      let currentAgentMessage = '';
      
      runTyped.watch((event) => {
        console.log(`📡 watch-v2イベント受信:`, JSON.stringify(event, null, 2));
        
        switch (event.type) {
          case 'tool-call-streaming-start':
            console.log(`🚀 エージェント/ツール呼び出し開始: ${event.name || event.toolName}`);
            
            // エージェント名からIDを抽出
            const agentName = event.name || event.toolName || '';
            if (agentName.includes('ceo') || agentName.includes('CEO')) {
              currentAgentId = 'ceo';
            } else if (agentName.includes('manager') || agentName.includes('Manager')) {
              currentAgentId = 'manager';
            } else if (agentName.includes('worker') || agentName.includes('Worker')) {
              currentAgentId = 'worker';
            } else {
              currentAgentId = 'system';
            }
            
            iterationCounter++;
            currentAgentMessage = '';
            
            const startEntry = formatAgentMessage(
              currentAgentId,
              agentName,
              `${agentName}が応答を開始しました...`,
              iterationCounter,
              'internal'
            );
            agentLogStore.addLogEntry(jobId, startEntry);
            break;
            
          case 'tool-call-delta':
            console.log(`📝 部分出力受信: ${event.argsTextDelta?.substring(0, 50)}...`);
            if (event.argsTextDelta) {
              currentAgentMessage += event.argsTextDelta;
              
              // メッセージが一定の長さに達したら送信（ストリーミング効果）
              if (currentAgentMessage.length > 100 && currentAgentMessage.length % 100 < event.argsTextDelta.length) {
                const deltaEntry = formatAgentMessage(
                  currentAgentId || 'agent',
                  event.name || 'Agent',
                  currentAgentMessage,
                  iterationCounter,
                  'response'
                );
                agentLogStore.addLogEntry(jobId, deltaEntry);
              }
            }
            break;
            
          case 'tool-call-streaming-finish':
          case 'tool-result':
            console.log(`🛠️ ツール完了: ${event.toolName || event.name}`);
            // 最終的なメッセージを送信
            if (currentAgentMessage) {
              const finalEntry = formatAgentMessage(
                currentAgentId || 'agent',
                event.name || event.toolName || 'Agent',
                currentAgentMessage,
                iterationCounter,
                'response'
              );
              agentLogStore.addLogEntry(jobId, finalEntry);
              currentAgentMessage = '';
            }
            break;
            
          case 'step-start':
            console.log(`🚀 ステップ開始: ${event.payload?.id || 'unknown'}`);
            iterationCounter++;
            const stepStartEntry = formatAgentMessage(
              'system',
              'Workflow',
              `ワークフローステップ「${event.payload?.id || 'unknown'}」を開始しました`,
              iterationCounter,
              'internal'
            );
            agentLogStore.addLogEntry(jobId, stepStartEntry);
            break;
            
          case 'step-result':
            console.log(`✅ ステップ完了: ${event.stepName}`);
            if (event.result) {
              iterationCounter++;
              const resultEntry = formatAgentMessage(
                'system',
                'Workflow Step',
                `ステップ「${event.stepName}」が完了: ${JSON.stringify(event.result).substring(0, 100)}...`,
                iterationCounter,
                'internal'
              );
              agentLogStore.addLogEntry(jobId, resultEntry);
            }
            break;
            
          case 'step-finish':
            console.log(`🏁 ステップ終了: ${event.stepName || 'unknown'}`);
            // step-finishイベントも処理（step-resultと同様に扱う）
            if (event.result || event.stepName) {
              const finishEntry = formatAgentMessage(
                'system',
                'Workflow Step',
                `ステップ「${event.stepName || 'unknown'}」が終了しました`,
                iterationCounter,
                'internal'
              );
              agentLogStore.addLogEntry(jobId, finishEntry);
            }
            break;
            
          default:
            console.log(`❓ 未知のイベントタイプ: ${event.type}`);
            // 未知のイベントも記録
            if (event.type) {
              const unknownEntry = formatAgentMessage(
                'system',
                'Unknown Event',
                `未知のイベント: ${event.type} - ${JSON.stringify(event).substring(0, 100)}...`,
                iterationCounter,
                'internal'
              );
              agentLogStore.addLogEntry(jobId, unknownEntry);
            }
        }
      }, 'watch-v2');
    } else {
      console.warn('⚠️ WorkflowRunがwatchメソッドをサポートしていません');
    }

    // メモリチェック用の変数
    let memoryCheckInterval: NodeJS.Timeout | null = null;
    let lastMessageCount = 0;
    
    // メモリを定期的にチェックしてリアルタイムログを送信
    const startMemoryMonitoring = async () => {
      const mastraTyped = mastraInstance as any;
      const memory = mastraTyped.memory || (mastraTyped.getMemory ? mastraTyped.getMemory() : null);
      
      if (memory && runtimeContext && agentLogStore) {
        const resourceId = runtimeContext.get('resourceId');
        const threadId = runtimeContext.get('threadId');
        
        if (resourceId && threadId) {
          console.log('🔍 メモリ監視を開始:', { resourceId, threadId, jobId });
          
          memoryCheckInterval = setInterval(async () => {
            try {
              const messages = await memory.getMessages({
                resourceId,
                threadId,
              });
              
              // 新しいメッセージのみを処理
              if (messages.length > lastMessageCount) {
                const newMessages = messages.slice(lastMessageCount);
                console.log(`📨 新しいメッセージを検出: ${newMessages.length}件`);
                
                newMessages.forEach((msg: any, index: number) => {
                  const globalIndex = lastMessageCount + index + 1;
                  
                  // エージェントIDを推定
                  let agentId = 'system';
                  let agentName = 'System';
                  
                  if (msg.content) {
                    const content = msg.content.toLowerCase();
                    const contentStart = msg.content.substring(0, 100);
                    
                    // より詳細なパターンマッチング
                    if (content.includes('ceo agent') || content.includes('strategic') || 
                        content.includes('high-level') || contentStart.includes('As the CEO')) {
                      agentId = 'ceo';
                      agentName = 'CEO Agent - Strategic Task Director';
                    } else if (content.includes('manager agent') || content.includes('plan') || 
                               content.includes('breakdown') || contentStart.includes('As the Manager')) {
                      agentId = 'manager';
                      agentName = 'Manager Agent - Task Planner';
                    } else if (content.includes('worker agent') || content.includes('execute') || 
                               content.includes('implementation') || contentStart.includes('As the Worker')) {
                      agentId = 'worker';
                      agentName = 'Worker Agent - Task Executor';
                    }
                  }
                  
                  console.log(`💬 エージェントメッセージ検出: ${agentName} (${msg.role})`);
                  
                  const conversationEntry = formatAgentMessage(
                    agentId,
                    agentName,
                    msg.content || '',
                    globalIndex,
                    msg.role === 'user' ? 'request' : 'response',
                    {
                      model: msg.metadata?.model,
                      timestamp: msg.createdAt || new Date().toISOString(),
                    }
                  );
                  
                  agentLogStore.addLogEntry(jobId, conversationEntry);
                });
                
                lastMessageCount = messages.length;
              }
            } catch (error) {
              console.error('❌ メモリチェックエラー:', error);
            }
          }, 1000); // 1秒ごとにチェック
        }
      }
    };
    
    // メモリ監視を開始
    startMemoryMonitoring();

    // ワークフローの完了を待つ
    const result = await run.start({ inputData, runtimeContext });

    // メモリ監視を停止
    if (memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
      console.log('🛑 メモリ監視を停止');
    }

    console.log('✅ エージェントネットワークワークフローが完了:', {
      jobId,
      taskType: inputData.taskType,
      timestamp: new Date().toISOString()
    });

    // ログストアのジョブを完了としてマーク
    if (agentLogStore) {
      const startTime = parseInt(jobId.split('-')[1]);
      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      agentLogStore.completeJob(jobId, {
        totalIterations: 3,
        agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
        executionTime: `${executionTime}s`,
      });
    }

    // 結果を保存
    updateJobStatus(jobId, 'completed');
    storeJobResult(jobId, result, 'agent-network-workflow');
    console.log('💾 ジョブ結果を保存しました:', jobId);

  } catch (error) {
    console.error('❌ エージェントネットワークワークフローエラー:', error);
    
    // ログストアのジョブを失敗としてマーク
    if (agentLogStore) {
      agentLogStore.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
    }
    
    // エラー時もステータスを保存
    updateJobStatus(jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// 汎用エージェントネットワークツール
export const agentNetworkTool = createTool({
  id: 'agent-network-executor',
  description: 'Execute any task through the hierarchical agent network (CEO-Manager-Worker pattern)',
  inputSchema: z.object({
    taskType: z.string().describe('Type of task: web-search, slide-generation, weather, etc.'),
    taskDescription: z.string().describe('Detailed description of what needs to be done'),
    taskParameters: z.any().describe('Task-specific parameters (query, location, topic, etc.)'),
    context: z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
      constraints: z.any().optional().describe('Any limitations or requirements'),
      expectedOutput: z.string().optional().describe('Description of expected output format'),
      additionalInstructions: z.string().optional().describe('Any additional instructions for the agents'),
    }).optional().describe('Additional context for task execution'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.string(),
    taskType: z.string(),
    message: z.string(),
    estimatedTime: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { taskType, taskDescription, taskParameters, context: taskContext } = context;
    
    // ジョブIDを生成
    const jobId = `agent-network-${taskType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    console.log('🎯 エージェントネットワークタスクを受信:', {
      jobId,
      taskType,
      taskDescription,
      hasRuntimeContext: !!runtimeContext
    });

    // ジョブを初期化
    initializeJob(jobId);

    // バックグラウンドでワークフローを実行
    setTimeout(() => {
      // 動的インポートで循環依存を回避
      import('../index').then(({ mastra: mastraInstance }) => {
        executeAgentNetworkWorkflow(mastraInstance, jobId, {
          jobId,
          taskType,
          taskDescription,
          taskParameters,
          context: taskContext,
        }, runtimeContext);
      });
    }, 0);

    // 推定時間をタスクタイプに基づいて設定
    const estimatedTimes: Record<string, string> = {
      'web-search': '15-30 seconds',
      'slide-generation': '30-60 seconds',
      'weather': '5-10 seconds',
      'default': '20-40 seconds'
    };

    return {
      jobId,
      status: 'queued',
      taskType,
      message: `Task has been queued for execution by the agent network. The CEO agent will analyze and delegate this ${taskType} task.`,
      estimatedTime: estimatedTimes[taskType] || estimatedTimes.default,
    };
  },
});