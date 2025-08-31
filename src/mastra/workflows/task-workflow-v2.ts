import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { RuntimeContext } from '@mastra/core/di';
import { createRoleAgent } from '../agents/factory';
import { agentLogStore, formatAgentMessage } from '../utils/agent-log-store';
import { extractSystemContext } from '../utils/shared-context';
import { buildWorkerPoolNetwork, generateWithWorkerNetwork } from '../networks/worker-network-vNext';

const TaskTypeEnum = z.enum(['web-search', 'slide-generation', 'weather', 'other']);

export const ceoManagerWorkerWorkflow = createWorkflow({
  id: 'ceo-manager-worker-workflow',
  description: 'Minimal sequential workflow: CEO policy → Manager planning → Worker network execution → Manager review → CEO finalize',
  inputSchema: z.object({
    jobId: z.string(),
    taskType: TaskTypeEnum,
    taskDescription: z.string(),
    taskParameters: z.record(z.unknown()).optional().default({}),
    selectedModel: z.string().optional(),
    modelOptions: z.record(z.unknown()).optional(),
    context: z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
      constraints: z.record(z.unknown()).optional(),
      expectedOutput: z.string().optional(),
      additionalInstructions: z.string().optional(),
    }).optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
})
  // CEO: Save policy (agent decides which tools to call)
  .then(
    createStep({
      id: 'ceo-policy',
      description: 'CEO reviews the task and (if needed) saves/updates policy using its tools',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum, taskDescription: z.string(), taskParameters: z.record(z.unknown()) }),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async ({ inputData, runtimeContext }) => {
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const jobId = inputData.jobId;
        const selectedModel = ((inputData as any).selectedModel ?? (rc.get?.('selectedModel') as string | undefined)) || 'claude-sonnet-4';
        try { if (!rc.get?.('threadId')) rc.set?.('threadId', jobId); if (!rc.get?.('resourceId')) rc.set?.('resourceId', jobId); } catch {}

        agentLogStore.addLogEntry(jobId, formatAgentMessage('ceo', 'CEO Agent', '方針策定フェーズを開始します。', 1, 'internal'));

        const systemContext = extractSystemContext(rc) || undefined;
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel, systemContext });
        await ceo.generate([
          {
            role: 'user',
            content:
              `あなたはCEOです。Network ID: ${jobId}\n` +
              `タスク: ${inputData.taskType} - ${inputData.taskDescription}\n` +
              `必要であれば自身のツールで方針(policy)を保存/更新してください。` +
              `（例: policyManagementTool の save_policy / update_policy など。ツール入力は必ずJSONオブジェクト。）` +
              `テキストには詳細な方針概要だけを返し、DB保存はツールで行ってください。`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        return { ok: true };
      },
    })
  )
  .map(async ({ getInitData }) => ({ ...(getInitData() as any) }))
  // Manager: Plan and register subtasks (agent uses its own tools)
  .then(
    createStep({
      id: 'manager-plan',
      description: 'Manager plans and registers subtasks using task management tools',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum, taskDescription: z.string(), taskParameters: z.record(z.unknown()) }),
      outputSchema: z.object({ planned: z.boolean() }),
      execute: async ({ inputData, runtimeContext }) => {
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const jobId = inputData.jobId;
        const selectedModel = ((inputData as any).selectedModel ?? (rc.get?.('selectedModel') as string | undefined)) || 'claude-sonnet-4';
        try { if (!rc.get?.('threadId')) rc.set?.('threadId', jobId); if (!rc.get?.('resourceId')) rc.set?.('resourceId', jobId); } catch {}

        agentLogStore.addLogEntry(jobId, formatAgentMessage('manager', 'Manager Agent', 'タスク分解フェーズを開始します。', 2, 'internal'));

        const systemContext = extractSystemContext(rc) || undefined;
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel, systemContext });
        await manager.generate([
          {
            role: 'user',
            content:
              `あなたはManagerです。Network ID: ${jobId}\n` +
              `方針に基づき、5-6個の小タスクを横方向に独立して計画し、あなたのツールでnetwork_tasksへ登録してください。` +
              `ステップ番号はユニークになるよう配慮してください。重複/衝突時は適切に再割当。` +
              `テキストには概要（カテゴリと意図）のみ返し、DB更新はツールで行ってください。`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        return { planned: true };
      },
    })
  )
  .map(async ({ getInitData }) => ({ ...(getInitData() as any) }))
  // Manager⇄Workerの非決定ループ（DB黒板に基づく継続判定）
  .then(
    createStep({
      id: 'execute-cycle',
      description: 'Manager reviews, Worker network executes; repeat until DB shows no queued/running tasks or directives',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum, taskDescription: z.string(), taskParameters: z.record(z.unknown()) }),
      outputSchema: z.object({ progressed: z.boolean() }),
      execute: async ({ inputData, runtimeContext }) => {
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const jobId = inputData.jobId;
        const selectedModel = ((inputData as any).selectedModel ?? (rc.get?.('selectedModel') as string | undefined)) || 'claude-sonnet-4';
        try { if (!rc.get?.('threadId')) rc.set?.('threadId', jobId); if (!rc.get?.('resourceId')) rc.set?.('resourceId', jobId); } catch {}

        const systemContext = extractSystemContext(rc) || undefined;
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel, systemContext });
        const workerNet = buildWorkerPoolNetwork({ id: `${jobId}:workers`, modelKey: selectedModel, systemContext });

        // ループ条件: DBに queued/running の小タスクがある、または pending 指示がある間
        // 安全装置として最大50サイクルだが、制御はDB状態で決まる（非決定的）
        const { getDAOs } = await import('../task-management/db/dao');
        const daos = getDAOs();

        let cycle = 0;
        while (cycle < 50) {
          cycle++;
          agentLogStore.addLogEntry(jobId, formatAgentMessage('manager', 'Manager Agent', `検収サイクル ${cycle}`, 4 + cycle, 'internal'));

          // 1) Managerがレビュー（アーティファクトから内容を確認し、必要なら差戻し・最終保存）
          await manager.generate([
            {
              role: 'user',
              content:
                `あなたはManagerです。Network ID: ${jobId}\n` +
                `- 直近の小タスクのドラフトは subtask-artifact から取得してレビューしてください（read_latest, diff_with_text, apply_edits）。\n` +
                `- 問題なければ subtask-artifact.finalize_to_task で network_tasks.task_result に最終保存し、status=completed に更新してください。\n` +
                `- 不足があれば network_directives に差戻し指示を pending で記録してください（Workerが次サイクルで対応）。\n` +
                `- テキストには要点のみ返してください。`,
            },
          ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

          // 2) DBを参照し、続行すべきか判定
          const summary = await daos.tasks.getNetworkSummary(jobId);
          const directives = await daos.directives.findPendingByNetworkId(jobId);
          const shouldContinue = (summary.queued + summary.running) > 0 || (directives?.length || 0) > 0;
          if (!shouldContinue) break;

          // 3) Workerネットワークに実行を委譲（逐次・ドラフトはアーティファクトへ）
          const prompt = `あなたはWorkerエージェントネットワークです。Network ID: ${jobId}\n` +
            `- 次のキュー済み小タスクを1件だけ実行してください（逐次）。\n` +
            `- 実行内容のドラフトは subtask-artifact ツールで (jobId, taskId) のアーティファクトに保存し、コミットしてください。\n` +
            `  MIMEはタスクに応じて選択します（slide-generation/HTML系→text/html、それ以外→text/markdown）。\n` +
            `  例: {\"action\":\"ensure\",\"jobId\":\"${jobId}\",\"taskId\":\"<taskId>\",\"taskType\":\"${inputData.taskType}\"} → {\"action\":\"worker_commit_text\",\"jobId\":\"${jobId}\",\"taskId\":\"<taskId>\",\"taskType\":\"${inputData.taskType}\",\"content\":\"...\"}\n` +
            `- 既存ドラフトがある場合は read_latest → apply_edits で部分編集し、差分だけをコミットして良いです。\n` +
            `- network_tasks の status は必要に応じて更新してください（queued→running）。completed は Manager が行います。\n` +
            `- 返すテキストは要点のみ。詳細本文はアーティファクトへ保存してください。`;

          await generateWithWorkerNetwork(workerNet, prompt, { thread: `${jobId}:worker`, resource: `${jobId}:worker`, runtimeContext: rc });

          // 4) 次サイクルへ（DBでまた判定）
        }

        return { progressed: true };
      },
    })
  )
  .map(async ({ getInitData }) => ({ ...(getInitData() as any) }))
  // CEO: Finalize and save final artifact (agent uses its tool)
  .then(
    createStep({
      id: 'ceo-finalize',
      description: 'CEO consolidates and saves final result using its tools',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum, taskDescription: z.string(), taskParameters: z.record(z.unknown()) }),
      outputSchema: z.object({ success: z.boolean(), message: z.string() }),
      execute: async ({ inputData, runtimeContext }) => {
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const jobId = inputData.jobId;
        const selectedModel = ((inputData as any).selectedModel ?? (rc.get?.('selectedModel') as string | undefined)) || 'claude-sonnet-4';
        try { if (!rc.get?.('threadId')) rc.set?.('threadId', jobId); if (!rc.get?.('resourceId')) rc.set?.('resourceId', jobId); } catch {}

        agentLogStore.addLogEntry(jobId, formatAgentMessage('ceo', 'CEO Agent', '最終化フェーズを開始します。', 5, 'internal'));

        const systemContext = extractSystemContext(rc) || undefined;
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel, systemContext });
        const { text } = await ceo.generate([
          {
            role: 'user',
            content:
              `あなたはCEOです。Network ID: ${jobId}\n` +
              `- これまでの小タスク結果を統合し、最終成果物を生成してください。\n` +
              `- 自身のツールで最終成果物を保存してください（finalResultTool 等）。入力は必ずJSONオブジェクト。\n` +
              `- テキストには要点や保存結果の要約を返してください。`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        return { success: true, message: text || 'Finalized' };
      },
    })
  )
  .commit();

export default ceoManagerWorkerWorkflow;
