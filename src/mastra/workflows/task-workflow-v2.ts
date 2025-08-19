import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { RuntimeContext } from '@mastra/core/di';
import { createRoleAgent } from '../agents/factory';
import { agentLogStore, formatAgentMessage } from '../utils/agent-log-store';
import { policyManagementTool, policyCheckTool } from '../task-management/tools/policy-management-tool';
import { directiveManagementTool } from '../task-management/tools/directive-management-tool';
import { batchTaskCreationTool } from '../task-management/tools/batch-task-creation-tool';
import { taskManagementTool } from '../task-management/tools/task-management-tool';
import { finalResultTool } from '../task-management/tools/final-result-tool';

// 入出力スキーマはエージェントネットワークツールと同等
const TaskTypeEnum = z.enum(['web-search', 'slide-generation', 'weather', 'other']);

export const ceoManagerWorkerWorkflow = createWorkflow({
  id: 'ceo-manager-worker-workflow',
  description: 'CEO-Manager-Workerによる方針策定→タスク分解→実行→検収→最終成果物保存のワークフロー',
  inputSchema: z.object({
    jobId: z.string(),
    taskType: TaskTypeEnum,
    taskDescription: z.string(),
    taskParameters: z.record(z.unknown()),
    context: z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
      constraints: z.record(z.unknown()).optional(),
      expectedOutput: z.string().optional(),
      additionalInstructions: z.string().optional(),
    }).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})
  // 1. CEO: 方針を決定しDBに保存
  .then(
    createStep({
      id: 'ceo-decide-policy',
      description: 'CEOがタスク方針を策定しpolicy-managementに保存',
      inputSchema: z.object({
        jobId: z.string(),
        taskType: TaskTypeEnum,
        taskDescription: z.string(),
        taskParameters: z.record(z.unknown()),
        context: z.object({
          priority: z.enum(['low', 'medium', 'high']).optional(),
          constraints: z.record(z.unknown()).optional(),
          expectedOutput: z.string().optional(),
          additionalInstructions: z.string().optional(),
        }).optional(),
      }),
      outputSchema: z.object({ policySaved: z.boolean() }),
      execute: async ({ inputData, runtimeContext }) => {
        const jobId = inputData.jobId;
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const selectedModel = (rc.get?.('selectedModel') as string | undefined) || 'claude-sonnet-4';
        // メモリ共有: すべてのエージェントに同一thread/resourceを使わせるため、必要ならthreadId=jobIdに設定
        try {
          const thread = rc.get?.('threadId') as string | undefined;
          const resource = rc.get?.('resourceId') as string | undefined;
          if (!thread) rc.set?.('threadId', jobId);
          if (!resource) rc.set?.('resourceId', jobId);
        } catch {}

        // ログ: 開始
        agentLogStore.addLogEntry(
          jobId,
          formatAgentMessage(
            'ceo',
            'CEO Agent',
            `方針策定を開始します。タスク: ${inputData.taskType} / 説明: ${inputData.taskDescription}`,
            1,
            'internal'
          )
        );

        // CEOエージェント（選択モデル）
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel });

        // ポリシーJSONを生成
        const { text } = await ceo.generate([
          {
            role: 'user',
            content:
              `以下のタスクに対する実施方針をJSONで出力してください。` +
              `フィールド: { "strategy": string, "priorities": string[], "successCriteria": string[], "qualityStandards": string[], ` +
              `"outputRequirements": { "format"?: string, "structure"?: string, "specificRequirements"?: string[] }, "resourcesNeeded"?: string[], "constraints"?: string[], "additionalNotes"?: string }\n` +
              `タスクタイプ: ${inputData.taskType}\n説明: ${inputData.taskDescription}\nパラメータ: ${JSON.stringify(
                inputData.taskParameters
              )}\n期待出力: ${inputData.context?.expectedOutput ?? ''}\n制約: ${JSON.stringify(
                inputData.context?.constraints ?? {}
              )}\n追加指示: ${inputData.context?.additionalInstructions ?? ''}\n` +
              `出力は必ず1つのJSONのみ（バッククオート不要）。`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        let policy: any;
        try {
          policy = JSON.parse(text || '{}');
        } catch {
          // JSON化に失敗した場合の簡易ポリシー
          policy = {
            strategy: 'Default strategy',
            priorities: ['Accuracy', 'Completeness'],
            successCriteria: ['Meets requirements'],
            qualityStandards: ['High quality'],
          };
        }

        // DBへ保存（ツール）: 先にメインタスク存在を確認し、無ければ作成
        try {
          const { getDAOs } = await import('../task-management/db/dao');
          const daos = getDAOs();
          const mainTask = await daos.tasks.findById(jobId);
          if (!mainTask) {
            await daos.tasks.create({
              task_id: jobId,
              network_id: jobId,
              parent_job_id: jobId,
              network_type: 'CEO-Manager-Worker',
              status: 'queued',
              task_type: inputData.taskType,
              task_description: inputData.taskDescription,
              task_parameters: inputData.taskParameters,
              progress: 0,
              created_by: 'ceo-agent',
              priority: inputData.context?.priority || 'medium',
              step_number: undefined,
              metadata: { isNetworkMainTask: true },
            } as any);
          }
        } catch (e) {
          console.warn('⚠️ メインタスク確認/作成に失敗（継続）:', e);
        }

        const saveRes = await policyManagementTool.execute({
          context: {
            action: 'save_policy',
            networkId: jobId,
            policy: policy as any,
          },
          runtimeContext: rc,
        });

        agentLogStore.addLogEntry(
          jobId,
          formatAgentMessage(
            'ceo',
            'CEO Agent',
            `方針を保存しました。メッセージ: ${saveRes.message}`,
            1,
            'response'
          )
        );

        return { policySaved: !!saveRes.success };
      },
    })
  )
  // 次ステップの入力を初期入力から供給
  .map(async ({ getInitData }) => {
    const init = getInitData() as { jobId: string; taskType: z.infer<typeof TaskTypeEnum>; taskDescription: string };
    return { jobId: init.jobId, taskType: init.taskType, taskDescription: init.taskDescription };
  })
  // 2. MANAGER: 方針確認→追加指示の確認→タスク分解/登録
  .then(
    createStep({
      id: 'manager-plan-and-create-subtasks',
      description: 'Managerが方針を確認し、追加指示をチェックし、サブタスクを計画・登録',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum, taskDescription: z.string() }),
      outputSchema: z.object({ tasksCreated: z.number() }),
      execute: async ({ inputData, runtimeContext }) => {
        const jobId = inputData.jobId;
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const selectedModel = (rc.get?.('selectedModel') as string | undefined) || 'claude-sonnet-4';
        try {
          const thread = rc.get?.('threadId') as string | undefined;
          const resource = rc.get?.('resourceId') as string | undefined;
          if (!thread) rc.set?.('threadId', jobId);
          if (!resource) rc.set?.('resourceId', jobId);
        } catch {}

        // ポリシー確認
        const policyCheck = await policyCheckTool.execute({ context: { networkId: jobId }, runtimeContext: rc });
        if (!policyCheck.hasPolicySet) {
          agentLogStore.addLogEntry(
            jobId,
            formatAgentMessage('manager', 'Manager Agent', '方針が未設定のため、CEOへ再依頼が必要です。', 1, 'internal')
          );
        }

        // 追加指示の確認（単純化: 1回チェックし、pendingがあればCEOがupdate）
        const directives = await directiveManagementTool.execute({ context: { action: 'check_directives', networkId: jobId }, runtimeContext: rc });

        // 再計画の制御フラグと開始ステップ
        let replanTriggered = false;
        let startingStepNumber = 1;

        if (directives.hasPending) {
          const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel });
          const { text } = await ceo.generate([
            {
              role: 'user',
              content:
                `追加指示が存在します。これを踏まえ、既存方針の更新が必要であれば更新JSONを出力してください。` +
                `出力はpolicyと同じスキーマのJSONのみ（バッククオート不要）。` +
                `保守的に必要部分のみ変更してください。` +
                `未変更なら {"strategy":"no-change"} のみ。`,
            },
          ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });
          let updatedPolicy: any | null = null;
          try {
            updatedPolicy = JSON.parse(text || '{}');
          } catch {
            updatedPolicy = null;
          }
          if (updatedPolicy && updatedPolicy.strategy && updatedPolicy.strategy !== 'no-change') {
            await policyManagementTool.execute({
              context: { action: 'update_policy', networkId: jobId, policy: updatedPolicy as any },
              runtimeContext: rc,
            });
            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage('ceo', 'CEO Agent', '追加指示を反映して方針を更新しました。', 2, 'response')
            );

            // 完了済み以外を起点ステップ以降で削除し、以降を再計画する
            try {
              const listBefore = await taskManagementTool.execute({ context: { action: 'list_network_tasks', networkId: jobId }, runtimeContext: rc });
              const existingTasks = (listBefore.tasks as Array<{ status: string; stepNumber?: number }> | undefined) || [];
              const completedSteps = existingTasks
                .filter(t => t.status === 'completed' && typeof t.stepNumber === 'number')
                .map(t => (t.stepNumber as number));
              const lastCompletedStep = completedSteps.length > 0 ? Math.max(...completedSteps) : 0;
              const fromStep = lastCompletedStep + 1;

              await taskManagementTool.execute({ context: { action: 'delete_tasks_from_step', networkId: jobId, fromStepNumber: fromStep }, runtimeContext: rc });

              startingStepNumber = fromStep;
              replanTriggered = true;

              agentLogStore.addLogEntry(
                jobId,
                formatAgentMessage('manager', 'Manager Agent', `方針更新に伴い、ステップ${fromStep}以降の未完了タスクを削除しました。`, 2, 'internal')
              );
            } catch (cleanupErr) {
              console.warn('⚠️ タスク再構成に失敗（継続）:', cleanupErr);
            }
          }
        }

        // タスク分解（ManagerがJSON計画を出力）
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel });
        const { text: planText } = await manager.generate([
          {
            role: 'user',
            content:
              `次のタスクを5-6個程度の小タスクに分解し、JSON配列で出力してください。` +
              `各要素は {"taskType": string, "taskDescription": string, "taskParameters"?: object, "stepNumber"?: number}。` +
              `出力はJSON配列のみ（バッククオート不要）。` +
              `元タスク: ${inputData.taskType} - ${inputData.taskDescription}`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        let tasks: Array<{
          taskType: string;
          taskDescription: string;
          taskParameters?: Record<string, unknown>;
          stepNumber?: number;
        }> = [];
        try {
          const parsed = JSON.parse(planText || '[]');
          if (Array.isArray(parsed)) tasks = parsed;
        } catch {
          // 最低限のフォールバック
          tasks = [
            { taskType: 'analysis', taskDescription: 'Analyze requirements' },
            { taskType: 'research', taskDescription: 'Research background' },
            { taskType: 'report', taskDescription: 'Draft initial output' },
          ];
        }

        // stepNumberを正規化（再計画時は最後の完了ステップ+1から通しで振り直し）
        const normalizedTasks = tasks.map((t, i) => ({
          taskType: t.taskType,
          taskDescription: t.taskDescription,
          taskParameters: t.taskParameters,
          stepNumber: replanTriggered ? (startingStepNumber + i) : (t.stepNumber ?? i + 1),
        }));

        const res = await batchTaskCreationTool.execute({ context: { networkId: jobId, tasks: normalizedTasks, autoAssign: false }, runtimeContext: rc });

        agentLogStore.addLogEntry(
          jobId,
          formatAgentMessage(
            'manager',
            'Manager Agent',
            replanTriggered
              ? `方針更新後の再計画としてサブタスクを作成しました (${res.totalTasks} 件)。`
              : `サブタスクを作成しました (${res.totalTasks} 件)。`,
            2,
            'response'
          )
        );

        return { tasksCreated: res.totalTasks ?? normalizedTasks.length };
      },
    })
  )
  // 次ステップの入力を初期入力から供給
  .map(async ({ getInitData }) => {
    const init = getInitData() as { jobId: string; taskType: z.infer<typeof TaskTypeEnum> };
    return { jobId: init.jobId, taskType: init.taskType };
  })
  // 3-4. WORKER: サブタスクの実行とMANAGERの検収を繰り返す
  .then(
    createStep({
      id: 'worker-execute-and-manager-review',
      description: 'Workerがサブタスクを順次実行し、Managerが検収して継続/差し戻しを判断',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum }),
      outputSchema: z.object({ completed: z.boolean() }),
      execute: async ({ inputData, runtimeContext }) => {
        const jobId = inputData.jobId;
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const selectedModel = (rc.get?.('selectedModel') as string | undefined) || 'claude-sonnet-4';
        try {
          const thread = rc.get?.('threadId') as string | undefined;
          const resource = rc.get?.('resourceId') as string | undefined;
          if (!thread) rc.set?.('threadId', jobId);
          if (!resource) rc.set?.('resourceId', jobId);
        } catch {}
        const worker = createRoleAgent({ role: 'WORKER', modelKey: selectedModel });
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel });

        let loopCount = 0;
        while (loopCount < 20) {
          loopCount++;
          // 次に実行すべきタスクをステップ番号昇順で取得（1から順に）
          const next = await taskManagementTool.execute({ context: { action: 'get_next_task', networkId: jobId }, runtimeContext: rc });
          const current = (next.task as { taskId: string; taskType: string; description: string; stepNumber?: number } | null);
          if (!current) break;
          const taskId = current.taskId;

          // 実行開始をDBに反映
          await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'running' }, runtimeContext: rc });

          agentLogStore.addLogEntry(
            jobId,
            formatAgentMessage('worker', 'Worker Agent', `小タスク実行開始: ${current.description}`, loopCount, 'request')
          );

          // 実行（簡易）
          const { text: workText } = await worker.generate([
            {
              role: 'user',
              content:
                `次の小タスクを実行し、要約結果を200-400字で返してください。` +
                `小タスク: ${current.taskType} - ${current.description}`,
            },
          ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

          // Managerによる検収
          const { text: review } = await manager.generate([
            {
              role: 'user',
              content:
                `次の結果をレビュし、"decision"が"accept"または"redo"のJSONで出力してください。` +
                `redoなら改善指示"instruction"も含めてください。` +
                `出力は {"decision":"accept"|"redo","instruction"?:string} のJSON（バッククオート不要）。\n結果: ${workText}`,
            },
          ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

          let decision: 'accept' | 'redo' = 'accept';
          let instruction: string | undefined;
          try {
            const obj = JSON.parse(review || '{}');
            if (obj.decision === 'redo') {
              decision = 'redo';
              instruction = typeof obj.instruction === 'string' ? obj.instruction : undefined;
            }
          } catch {
            // 既定はaccept
          }

          if (decision === 'redo') {
            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage('manager', 'Manager Agent', `結果が不十分のため差し戻し: ${instruction ?? ''}`, loopCount, 'response')
            );
            // 差し戻し: 簡易に再実行して受理
            const { text: retry } = await worker.generate([
              { role: 'user', content: `改善指示: ${instruction ?? '品質を向上'} に従って再実行してください。` },
            ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });
            await taskManagementTool.execute({ context: { action: 'update_result', networkId: jobId, taskId, result: { text: retry, accepted: true } }, runtimeContext: rc });
            await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'completed' }, runtimeContext: rc });
            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage('worker', 'Worker Agent', `小タスクを再実行し完了しました。`, loopCount, 'response')
            );
          } else {
            await taskManagementTool.execute({ context: { action: 'update_result', networkId: jobId, taskId, result: { text: workText, accepted: true } }, runtimeContext: rc });
            await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'completed' }, runtimeContext: rc });
            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage('manager', 'Manager Agent', `結果を受理し保存しました。`, loopCount, 'response')
            );
          }
        }

        return { completed: true };
      },
    })
  )
  // 最終ステップの入力を初期入力から供給
  .map(async ({ getInitData }) => {
    const init = getInitData() as { jobId: string; taskType: z.infer<typeof TaskTypeEnum> };
    return { jobId: init.jobId, taskType: init.taskType };
  })
  // 5. CEO: 全結果を取得し最終成果物を保存
  .then(
    createStep({
      id: 'ceo-consolidate-and-finalize',
      description: 'CEOが各小タスクの結果を統合し、最終成果物を保存',
      inputSchema: z.object({ jobId: z.string(), taskType: TaskTypeEnum }),
      outputSchema: z.object({ success: z.boolean(), message: z.string() }),
      execute: async ({ inputData, runtimeContext }) => {
        const jobId = inputData.jobId;
        const rc = (runtimeContext as RuntimeContext | undefined) ?? new RuntimeContext();
        const selectedModel = (rc.get?.('selectedModel') as string | undefined) || 'claude-sonnet-4';
        try {
          const thread = rc.get?.('threadId') as string | undefined;
          const resource = rc.get?.('resourceId') as string | undefined;
          if (!thread) rc.set?.('threadId', jobId);
          if (!resource) rc.set?.('resourceId', jobId);
        } catch {}
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel });

        // 全小タスクの結果を収集
        const listRes = await taskManagementTool.execute({ context: { action: 'list_network_tasks', networkId: jobId }, runtimeContext: rc });
        const tasks = (listRes.tasks as Array<{ taskId: string; description: string; status: string; stepNumber?: number }> | undefined) || [];
        const detailed: Array<{ step?: number; id: string; description: string; status: string; result?: unknown }> = [];
        for (const t of tasks) {
          const tr = await taskManagementTool.execute({ context: { action: 'get_task', networkId: jobId, taskId: t.taskId }, runtimeContext: rc });
          // tr.task.task_result にworkerが保存した結果が入る
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const taskRow = tr.task as any;
          detailed.push({ step: t.stepNumber, id: t.taskId, description: t.description, status: t.status, result: taskRow?.task_result });
        }

        const { text: finalText } = await ceo.generate([
          {
            role: 'user',
            content:
              `以下の小タスク結果を統合し、タスク種別(${inputData.taskType})にふさわしい最終成果物のみを生成してください。` +
              `禁止事項: 手順の列挙、メタ説明、品質方針、内部工程の記述。` +
              `出力要件:` +
              (inputData.taskType === 'slide-generation'
                ? ` HTML文字列（完全な単一HTMLドキュメント）` 
                : ` 日本語の完成したレポート本文（見出し・本文・箇条書き等可、引用・参照元は文末に列挙）`) +
              `\n小タスク結果(JSON): ${JSON.stringify(detailed).slice(0, 12000)}`,
          },
        ], { memory: { thread: jobId, resource: jobId }, runtimeContext: rc });

        const save = await finalResultTool.execute({
          context: {
            networkId: jobId,
            taskType: (inputData.taskType as any) || 'other',
            finalResult: inputData.taskType === 'slide-generation' ? { htmlCode: finalText } : { text: finalText },
            metadata: {},
          },
          runtimeContext: rc,
        });

        agentLogStore.addLogEntry(
          jobId,
          formatAgentMessage('ceo', 'CEO Agent', `最終成果物を保存しました。`, 99, 'response')
        );

        return { success: !!save.success, message: save.message };
      },
    })
  )
  .commit();

export default ceoManagerWorkerWorkflow;

