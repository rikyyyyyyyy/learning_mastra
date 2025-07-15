import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';


// ジョブの保存ディレクトリ
const JOB_RESULTS_DIR = path.join(process.cwd(), '.job-results');

// ディレクトリの初期化
const ensureJobResultsDir = async () => {
  try {
    await fs.access(JOB_RESULTS_DIR);
  } catch {
    await fs.mkdir(JOB_RESULTS_DIR, { recursive: true });
  }
};

// バックグラウンドでワークフローを実行
const executeAgentNetworkWorkflow = async (
  mastraInstance: unknown,
  jobId: string,
  inputData: {
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
    await ensureJobResultsDir();
    const jobStatusPath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: 'running',
      workflowId: 'agent-network-workflow',
      taskType: inputData.taskType,
      createdAt: new Date().toISOString(),
    }, null, 2));

    // ワークフローの完了を待つ
    const result = await run.start({ inputData, runtimeContext });

    console.log('✅ エージェントネットワークワークフローが完了:', {
      jobId,
      taskType: inputData.taskType,
      timestamp: new Date().toISOString()
    });

    // 結果をファイルに保存
    const finalResult = {
      jobId,
      status: 'completed',
      workflowId: 'agent-network-workflow',
      taskType: inputData.taskType,
      result: result,
      completedAt: new Date().toISOString(),
    };

    await fs.writeFile(jobStatusPath, JSON.stringify(finalResult, null, 2));
    console.log('💾 ジョブ結果を保存しました:', jobStatusPath);

  } catch (error) {
    console.error('❌ エージェントネットワークワークフローエラー:', error);
    
    // エラー時もステータスを保存
    const jobStatusPath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: 'failed',
      workflowId: 'agent-network-workflow',
      taskType: inputData.taskType,
      error: error instanceof Error ? error.message : 'Unknown error',
      failedAt: new Date().toISOString(),
    }, null, 2));
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
    await ensureJobResultsDir();
    const jobStatusPath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: 'queued',
      taskType,
      taskDescription,
      createdAt: new Date().toISOString(),
    }, null, 2));

    // バックグラウンドでワークフローを実行
    setTimeout(() => {
      // 動的インポートで循環依存を回避
      import('../index').then(({ mastra: mastraInstance }) => {
        executeAgentNetworkWorkflow(mastraInstance, jobId, {
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