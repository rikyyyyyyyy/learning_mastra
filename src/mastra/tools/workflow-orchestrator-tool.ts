import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';
import { agentLogStore } from '../utils/agent-log-store';

export const workflowOrchestratorTool = createTool({
  id: 'workflow-orchestrator',
  description: 'Mastraワークフロー（CEO-Manager-Worker）でタスクを実行します',
  inputSchema: z.object({
    taskType: z.enum(['web-search', 'slide-generation', 'weather', 'other']).describe('Type of task'),
    taskDescription: z.string().min(1),
    taskParameters: z.record(z.unknown()).describe('Task-specific parameters (object expected)'),
    context: z
      .object({
        priority: z.enum(['low', 'medium', 'high']).optional(),
        constraints: z.record(z.unknown()).optional(),
        expectedOutput: z.string().optional(),
        additionalInstructions: z.string().optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.string(),
    taskType: z.string(),
    message: z.string(),
    estimatedTime: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { taskType, taskDescription, taskParameters, context: taskContext } = context as {
      taskType: 'web-search' | 'slide-generation' | 'weather' | 'other';
      taskDescription: string;
      taskParameters: Record<string, unknown>;
      context?: { priority?: 'low' | 'medium' | 'high'; constraints?: unknown; expectedOutput?: string; additionalInstructions?: string };
    };

    const jobId = `workflow-${taskType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    await initializeJob(jobId);
    if (!agentLogStore.getJobLog(jobId)) {
      agentLogStore.createJob(jobId, taskType);
    }

    setTimeout(async () => {
      try {
        updateJobStatus(jobId, 'running');

        // 中央のMastraインスタンスからワークフローを取得
        const { mastra: mastraInstance } = await import('../index');
        // タスク管理DBにメインネットワークタスクを作成
        try {
          const { getDAOs } = await import('../task-management/db/dao');
          const daos = getDAOs();
          const createdBy = (runtimeContext as { get?: (k: string) => unknown })?.get?.('agentName') as string || 'general-agent';
          await daos.tasks.create({
            task_id: jobId,
            network_id: jobId,
            parent_job_id: jobId,
            network_type: 'CEO-Manager-Worker',
            status: 'queued',
            task_type: taskType,
            task_description: taskDescription,
            task_parameters: taskParameters,
            progress: 0,
            created_by: createdBy,
            priority: taskContext?.priority || 'medium',
            step_number: undefined,
            metadata: {
              isNetworkMainTask: true,
              expectedOutput: taskContext?.expectedOutput,
              constraints: taskContext?.constraints,
              additionalInstructions: taskContext?.additionalInstructions,
            },
          } as any);
        } catch (e) {
          console.warn('⚠️ メインタスク作成に失敗（継続）:', e);
        }
        // ランタイムコンテキストにジョブ情報を伝播（メモリ共有のためthreadにjobIdを設定）
        try {
          (runtimeContext as { set?: (k: string, v: unknown) => void })?.set?.('currentJobId', jobId);
          const existingThread = (runtimeContext as { get?: (k: string) => unknown })?.get?.('threadId') as string | undefined;
          if (!existingThread) {
            (runtimeContext as { set?: (k: string, v: unknown) => void })?.set?.('threadId', jobId);
          }
        } catch {}

        const wf = mastraInstance.getWorkflow('ceo-manager-worker-workflow');
        if (!wf) throw new Error('Workflow ceo-manager-worker-workflow not found');

        const run = await wf.createRunAsync();

        // 選択されたモデル・スレッド/リソースをそのままRuntimeContextに渡す
        const stream = await run.stream({
          inputData: {
            jobId,
            taskType,
            taskDescription,
            taskParameters,
            context: taskContext as { priority?: 'low'|'medium'|'high'; constraints?: Record<string, unknown>; expectedOutput?: string; additionalInstructions?: string } | undefined,
          },
          runtimeContext,
        });

        // ストリームはここでは詳細に加工せず、完了後に結果を保存
        const result = await (typeof stream.getWorkflowState === 'function' ? stream.getWorkflowState() : Promise.resolve(undefined));

        if (result?.status === 'success') {
          updateJobStatus(jobId, 'completed');
        } else if (result?.status === 'failed') {
          updateJobStatus(jobId, 'failed', { error: 'workflow failed' });
        } else {
          updateJobStatus(jobId, 'completed');
        }

        // 最終成果物はCEO最終ステップで保存されるため、ここではjob_resultsを保存しない
        agentLogStore.completeJob(jobId, { executionTime: 'n/a' });
      } catch (e) {
        updateJobStatus(jobId, 'failed', { error: e instanceof Error ? e.message : 'unknown error' });
        agentLogStore.failJob(jobId, e instanceof Error ? e.message : 'unknown error');
      }
    }, 0);

    const estimatedTimes: Record<'web-search' | 'slide-generation' | 'weather' | 'other', string> = {
      'web-search': '15-30 seconds',
      'slide-generation': '30-60 seconds',
      'weather': '5-10 seconds',
      'other': '20-40 seconds',
    };

    return {
      jobId,
      status: 'queued',
      taskType,
      message: `Task has been queued for execution by the workflow orchestrator.`,
      estimatedTime: estimatedTimes[taskType],
    };
  },
});

export default workflowOrchestratorTool;

