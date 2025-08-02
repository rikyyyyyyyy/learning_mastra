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
    
    // ワークフローの実行中にstep-startイベントを監視
    const runTyped = run as {
      start: (options: { inputData: unknown; runtimeContext?: unknown }) => Promise<unknown>;
      watch?: (callback: (event: any) => void, channel?: string) => void;
    };
    
    // step-startやstep-finishイベントのみを監視（ワークフローレベルのイベント）
    if (runTyped.watch) {
      console.log('🔍 ワークフローレベルのイベント監視を開始');
      
      runTyped.watch((event) => {
        // ワークフローレベルのイベントのみログ出力
        if (event.type === 'step-start' || event.type === 'step-finish' || event.type === 'step-result') {
          console.log(`📡 ワークフローイベント: ${event.type}`);
        }
      }, 'watch-v2');
    }

    // ワークフローの完了を待つ
    const result = await run.start({ inputData, runtimeContext });

    console.log('✅ エージェントネットワークワークフローが完了:', {
      jobId,
      taskType: inputData.taskType,
      timestamp: new Date().toISOString()
    });

    // 結果を保存
    updateJobStatus(jobId, 'completed');
    storeJobResult(jobId, result, 'agent-network-workflow');
    console.log('💾 ジョブ結果を保存しました:', jobId);

  } catch (error) {
    console.error('❌ エージェントネットワークワークフローエラー:', error);
    
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