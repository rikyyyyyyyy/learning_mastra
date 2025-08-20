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
import { extractSystemContext } from '../utils/shared-context';
import { artifactIOTool } from '../task-management/tools/artifact-io-tool';
import { contentStoreTool } from '../task-management/tools/content-store-tool';

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

        // RuntimeContextからシステムコンテキストを抽出
        const systemContext = extractSystemContext(rc);
        
        // CEOエージェント（選択モデル）
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel, systemContext: systemContext || undefined });

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
          const systemContext = extractSystemContext(rc);
          const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel, systemContext: systemContext || undefined });
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
        const systemContextForManager = extractSystemContext(rc);
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel, systemContext: systemContextForManager || undefined });
        const { text: planText } = await manager.generate([
          {
            role: 'user',
            content:
              `次のタスクを観点/カテゴリベースで横方向に分解し、5-6個程度の独立した小タスクとしてJSON配列で出力してください。` +
              `カテゴリは互いに重複せず、依存関係は原則として持たない並列関係にしてください（例: 政治/経済/技術/社会/環境 等）。` +
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
        const systemContext = extractSystemContext(rc);
        const worker = createRoleAgent({ role: 'WORKER', modelKey: selectedModel, systemContext: systemContext || undefined });
        const manager = createRoleAgent({ role: 'MANAGER', modelKey: selectedModel, systemContext: systemContext || undefined });

        // タスクの総数を取得して進捗管理
        const allTasksResult = await taskManagementTool.execute({ context: { action: 'list_network_tasks', networkId: jobId }, runtimeContext: rc });
        const allTasks = (allTasksResult.tasks as Array<{ taskId: string; status: string }> | undefined) || [];
        const totalTasks = allTasks.length;
        console.log(`📋 Total tasks to execute: ${totalTasks}`);
        
        let loopCount = 0;
        let completedCount = 0;
        while (loopCount < 20) {
          loopCount++;
          // 次に実行すべきタスクをステップ番号昇順で取得（1から順に）
          const next = await taskManagementTool.execute({ context: { action: 'get_next_task', networkId: jobId }, runtimeContext: rc });
          const current = (next.task as { taskId: string; taskType: string; description: string; stepNumber?: number } | null);
          if (!current) {
            console.log(`✅ All tasks completed. Total executed: ${completedCount}/${totalTasks}`);
            break;
          }
          const taskId = current.taskId;
          
          console.log(`🔄 Starting task ${current.stepNumber || loopCount}: ${current.taskType} - ${current.description}`);

          // 実行開始をDBに反映
          await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'running' }, runtimeContext: rc });

          // サブタスク単位で会話履歴を分離（連続メッセージ一貫性）
          const taskThreadId = `${jobId}:${taskId}`;

          agentLogStore.addLogEntry(
            jobId,
            formatAgentMessage('worker', 'Worker Agent', `小タスク実行開始: ${current.description}`, loopCount, 'request')
          );

          // 受理まで多段実行（continue と revise を区別し、中間結果は保存しない）
          const maxAttempts = 10;
          let attemptCount = 0;
          let accepted = false;
          let lastDecision: 'initial' | 'continue' | 'revise' = 'initial';
          let reviseInstruction: string | undefined = undefined;

          while (attemptCount < maxAttempts && !accepted) {
            attemptCount++;

            // Worker 実行プロンプト
            const workerPrompt = (
              lastDecision === 'initial'
                ? `次の小タスクを実行してください。小タスク: ${current.taskType} - ${current.description}`
                : lastDecision === 'continue'
                  ? `前回の続きから、重複を避けて継続してください。必要に応じて前回までの内容を踏まえて欠落部分を埋めてください。`
                  : `改善指示: ${reviseInstruction ?? '品質を向上'} に従い、必要箇所のみ修正した完全な最新版を出力してください。`
            ) + `\n\n【ツール使用ルール】\n- 必要に応じて docsReaderTool / exaMCPSearchTool を使用してよい。\n- すべてのツール入力は必ずJSONオブジェクト（辞書）で指定する（例: { \"path\": \"docs/rules/slide-html-rules.md\" }）。文字列や配列を直接渡してはならない。\n- 不要な場合はツールを呼び出さずにテキスト結果のみでもよい。`;

            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage(
                'worker',
                'Worker Agent',
                attemptCount === 1
                  ? `小タスクを実行: ${current.description}`
                  : `小タスクを再実行（試行${attemptCount}回目）`,
                loopCount,
                'request'
              )
            );

            const { text: workText } = await worker.generate([
              { role: 'user', content: workerPrompt },
            ], { memory: { thread: taskThreadId, resource: taskThreadId }, runtimeContext: rc });

            // Manager による検収（accept / continue / revise）
            const { text: review } = await manager.generate([
              {
                role: 'user',
                content:
                  `次の結果をレビューし、JSONで判定してください。` +
                  `decision: "accept" | "continue" | "revise" のいずれか。` +
                  `- continue: 出力が部分的/未完了/トークン上限で途切れているなど、続きが必要な場合。` +
                  `- revise: 誤り/品質不足/要件逸脱があり修正が必要な場合（具体的なinstructionを出す）。` +
                  `- accept: 要件を満たして十分な深さがあり受理できる場合。` +
                  `出力は {"decision":"accept"|"continue"|"revise","instruction"?:string} のJSON（バッククオート不要）。` +
                  `\n【重要】このレビューではツールを呼び出さず、テキストのみでJSONを返してください。` +
                  `\n結果: ${workText}`,
              },
            ], { memory: { thread: taskThreadId, resource: taskThreadId }, runtimeContext: rc });

            let decision: 'accept' | 'continue' | 'revise' = 'accept';
            let instruction: string | undefined;
            try {
              const obj = JSON.parse(review || '{}');
              if (obj.decision === 'continue' || obj.decision === 'revise') {
                decision = obj.decision;
                instruction = typeof obj.instruction === 'string' ? obj.instruction : undefined;
              }
            } catch {
              // 既定はaccept
            }

            if (decision === 'continue') {
              agentLogStore.addLogEntry(
                jobId,
                formatAgentMessage('manager', 'Manager Agent', `出力が未完了のため続きの生成を要求します。`, loopCount, 'response')
              );
              lastDecision = 'continue';
              // 継続: 完了/結果保存は行わず次の試行へ
              continue;
            }

            if (decision === 'revise') {
              agentLogStore.addLogEntry(
                jobId,
                formatAgentMessage('manager', 'Manager Agent', `修正が必要: ${instruction ?? ''}`, loopCount, 'response')
              );
              reviseInstruction = instruction;
              lastDecision = 'revise';
              // 修正: 完了/結果保存は行わず次の試行へ
              continue;
            }

            // 受理: 現在の出力を保存（内部的にCAS使用、DBには実コンテンツを保存）
            // 1. 内部的にアーティファクトを作成（トークン削減のため）
            const createResult = await artifactIOTool.execute({
              context: {
                action: 'create',
                jobId: jobId,
                taskId: taskId,
                mimeType: current.taskType === 'slide-generation' ? 'text/html' : 'text/plain',
                labels: { taskType: current.taskType, description: current.description },
              },
              runtimeContext: rc,
            });
            
            if (createResult.success && createResult.artifactId) {
              // 2. コンテンツを追加
              await artifactIOTool.execute({
                context: {
                  action: 'append',
                  artifactId: createResult.artifactId,
                  content: workText,
                },
                runtimeContext: rc,
              });
              
              // 3. リビジョンをコミット
              await artifactIOTool.execute({
                context: {
                  action: 'commit',
                  artifactId: createResult.artifactId,
                  message: `Task completed: ${current.description}`,
                  author: 'worker-agent',
                },
                runtimeContext: rc,
              });
              
              // 4. タスクDBには実際のコンテンツを保存（ユーザー要求に従う）
              await taskManagementTool.execute({ 
                context: { 
                  action: 'update_result', 
                  networkId: jobId, 
                  taskId, 
                  result: workText  // 実際のコンテンツをそのまま保存
                }, 
                runtimeContext: rc 
              });
              
              agentLogStore.addLogEntry(
                jobId,
                formatAgentMessage('manager', 'Manager Agent', `結果を受理し保存しました（アーティファクト: ${createResult.reference}）。`, loopCount, 'response')
              );
            } else {
              // フォールバック: 従来の方法で保存
              await taskManagementTool.execute({ 
                context: { 
                  action: 'update_result', 
                  networkId: jobId, 
                  taskId, 
                  result: workText  // 実際のコンテンツをそのまま保存
                }, 
                runtimeContext: rc 
              });
              
              agentLogStore.addLogEntry(
                jobId,
                formatAgentMessage('manager', 'Manager Agent', `結果を受理し保存しました。`, loopCount, 'response')
              );
            }
            
            await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'completed' }, runtimeContext: rc });
            accepted = true;
            completedCount++;
            console.log(`✅ Task completed (${completedCount}/${totalTasks}): ${current.taskType}`);
          }

          if (!accepted) {
            // 最大試行数を超えても受理されない場合は失敗としてマーク
            await taskManagementTool.execute({ context: { action: 'update_status', networkId: jobId, taskId, status: 'failed' }, runtimeContext: rc });
            agentLogStore.addLogEntry(
              jobId,
              formatAgentMessage('manager', 'Manager Agent', `複数回の差し戻し後も受理できず、タスクを失敗としてマークしました。`, loopCount, 'response')
            );
            console.log(`❌ Task failed: ${current.taskType}`);
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
        const systemContext = extractSystemContext(rc);
        const ceo = createRoleAgent({ role: 'CEO', modelKey: selectedModel, systemContext: systemContext || undefined });

        // 全小タスクの結果を収集（DBから直接実コンテンツを取得）
        const listRes = await taskManagementTool.execute({ context: { action: 'list_network_tasks', networkId: jobId }, runtimeContext: rc });
        const tasks = (listRes.tasks as Array<{ taskId: string; description: string; status: string; stepNumber?: number }> | undefined) || [];
        const detailed: Array<{ step?: number; id: string; description: string; status: string; result?: unknown }> = [];
        
        for (const t of tasks) {
          const tr = await taskManagementTool.execute({ context: { action: 'get_task', networkId: jobId, taskId: t.taskId }, runtimeContext: rc });
          // tr.task.task_result にworkerが保存した結果が入る（実コンテンツ）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const taskRow = tr.task as any;
          const taskResult = taskRow?.task_result;
          
          detailed.push({ step: t.stepNumber, id: t.taskId, description: t.description, status: t.status, result: taskResult });
        }

        const { text: finalText } = await ceo.generate([
          {
            role: 'user',
            content:
              `以下の小タスク結果を統合し、タスク種別(${inputData.taskType})にふさわしい最終成果物のみを生成してください。` +
              `\n【重要】ツールは使用せず、テキストのみを返してください。` +
              `\n禁止事項: 手順の列挙、メタ説明、品質方針、内部工程の記述、ツールの使用。` +
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

