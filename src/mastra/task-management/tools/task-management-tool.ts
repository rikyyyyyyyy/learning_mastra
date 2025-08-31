import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
import { TaskStatus } from '../db/schema';
import {
  ERROR_CODES,
  requirePolicy,
  requireStage,
  setNetworkStage,
  requireTaskExists,
  ensureQueued,
  ensureNotRunning,
  computeNextStageOnFirstRun,
  checkPartialContinuity,
  ensureTaskIsNextAndNoConcurrent,
  NetworkStage,
} from './routing-validators';

// Task Management Tool - Manager用のタスク管理ツール
export const taskManagementTool = createTool({
  id: 'task-management',
  description: 'Manage tasks for network agents - create, update, monitor progress, and retrieve results',
  inputSchema: z.object({
    action: z.enum([
      'create_task',
      'update_status',
      'update_progress',
      'update_result',
      'assign_worker',
      'get_task',
      'list_network_tasks',
      'get_network_summary',
      'get_pending_tasks',
      'get_next_task',
      'delete_tasks_from_step',
      'complete_task',
    ]),
    networkId: z.string().describe('Network ID for the agent network'),
    taskId: z.string().optional().describe('Task ID for operations that require it'),
    taskData: z.object({
      taskType: z.string().optional(),
      taskDescription: z.string().optional(),
      taskParameters: z.unknown().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).optional().describe('Data for creating a new task'),
    status: TaskStatus.optional().describe('New status for update operations'),
    progress: z.number().min(0).max(100).optional().describe('Progress percentage'),
    result: z.unknown().optional().describe('Task execution result'),
    workerId: z.string().optional().describe('Worker ID for assignment'),
    fromStepNumber: z.number().int().positive().optional().describe('Delete tasks from this step number (inclusive) if not completed'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    taskId: z.string().optional(),
    task: z.unknown().optional(),
    tasks: z.array(z.unknown()).optional(),
    summary: z.unknown().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    errorCode: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const startTime = Date.now();
    
    try {
      const { action, networkId, taskId, taskData, status, progress, result, workerId } = context;
      
      // networkId 一貫性チェック: runtimeContext.currentJobId が存在すれば照合
      try {
        const currentJobId = (runtimeContext as { get?: (key: string) => unknown })?.get?.('currentJobId') as string | undefined;
        if (currentJobId && currentJobId !== networkId) {
          return {
            success: false,
            action,
            error: `Network ID mismatch. expected=${currentJobId} received=${networkId}`,
          };
        }
      } catch {
        // 取得失敗時はスキップ（後方互換）
      }
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Task Management Tool approaching timeout limit');
      }

      switch (action) {
        case 'create_task': {
          // 前提: policy があること、stage=planningのみ
          const policy = await requirePolicy(networkId);
          if (!policy.success) {
            return { success: false, action, error: (policy as { message?: string }).message || 'Policy check failed', errorCode: ERROR_CODES.POLICY_NOT_SET };
          }
          const st = await requireStage(networkId, ['planning']);
          if (!st.success) {
            return { success: false, action, error: (st as { message?: string }).message || 'Stage check failed', errorCode: ERROR_CODES.INVALID_STAGE };
          }
          if (!taskData?.taskType || !taskData?.taskDescription) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskType, taskDescription',
            };
          }

          const newTaskId = taskId || `task-${networkId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          
          const newTask = await daos.tasks.create({
            task_id: newTaskId,
            network_id: networkId,
            network_type: 'CEO-Manager-Worker',
            status: 'queued',
            task_type: taskData.taskType,
            task_description: taskData.taskDescription,
            task_parameters: taskData.taskParameters,
            progress: 0,
            created_by: 'manager-agent',
            metadata: taskData.metadata,
            // priority は小タスクでは不要だが DB スキーマと型整合のため付与
            priority: 'medium',
          });

          return {
            success: true,
            action,
            taskId: newTaskId,
            task: newTask,
            message: `Task created successfully with ID: ${newTaskId}`,
          };
        }

        case 'update_status': {
          if (!taskId || !status) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, status',
            };
          }
          // 実体取得
          const existing = await daos.tasks.findById(taskId);
          if (!existing) {
            return { success: false, action, taskId, error: `Task ${taskId} not found`, errorCode: ERROR_CODES.TASK_NOT_FOUND };
          }
          // runningへ移行時の厳密チェック
          if (status === 'running') {
            const q = ensureQueued(existing);
            if (!q.success) return { success: false, action, taskId, error: (q as { message?: string }).message || 'Task not queued', errorCode: ERROR_CODES.TASK_NOT_QUEUED };
            const nr = ensureNotRunning(existing);
            if (!nr.success) return { success: false, action, taskId, error: (nr as { message?: string }).message || 'Task already running', errorCode: ERROR_CODES.TASK_ALREADY_RUNNING };
            // 順序・同時実行制御
            const gate = await requireStage(networkId, ['planning', 'executing']);
            if (!gate.success) return { success: false, action, taskId, error: (gate as { message?: string }).message || 'Invalid stage', errorCode: ERROR_CODES.INVALID_STAGE };
            const seq = await (async () => ensureTaskIsNextAndNoConcurrent(networkId, existing))();
            if (!seq.success) return { success: false, action, taskId, error: (seq as { message?: string }).message || 'Sequence check failed', errorCode: (seq as { errorCode?: string }).errorCode || ERROR_CODES.INVALID_STEP_ORDER };
            // 初回実行なら stage を executing へ引き上げ
            try {
              const st = await requireStage(networkId, ['planning', 'executing']);
              if (st.success) {
                const next = computeNextStageOnFirstRun((st as { stage?: string }).stage as NetworkStage || 'planning');
                if (next === 'executing') await setNetworkStage(networkId, 'executing');
              }
            } catch {}
          }
          // completed へ移行時: 部分出力のまま完了は不可
          if (status === 'completed') {
            const md = (existing.metadata as Record<string, unknown> | undefined) || {};
            const isPartial = !!(md.result as Record<string, unknown> | undefined)?.partial;
            if (isPartial) {
              return { success: false, action, taskId, error: 'Result is partial; require same worker to continue', errorCode: ERROR_CODES.RESULT_PARTIAL_CONTINUE_REQUIRED };
            }
          }
          await daos.tasks.updateStatus(taskId, status);

          return {
            success: true,
            action,
            taskId,
            message: `Task ${taskId} status updated to ${status}`,
          };
        }

        case 'update_progress': {
          if (!taskId || progress === undefined) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, progress',
            };
          }

          await daos.tasks.updateProgress(taskId, progress);

          return {
            success: true,
            action,
            taskId,
            message: `Task ${taskId} progress updated to ${progress}%`,
          };
        }

        case 'update_result': {
          if (!taskId || result === undefined) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, result',
            };
          }
          const existing = await daos.tasks.findById(taskId);
          if (!existing) {
            return { success: false, action, taskId, error: `Task ${taskId} not found`, errorCode: ERROR_CODES.TASK_NOT_FOUND };
          }
          // 追加パラメータ: resultMode / authorAgentId
          const resultMode = (context as Record<string, unknown>)['resultMode'] as 'partial' | 'final' | undefined;
          const authorAgentId = (context as Record<string, unknown>)['authorAgentId'] as string | undefined;
          if (resultMode === 'final' && authorAgentId) {
            const cont = checkPartialContinuity(existing, authorAgentId, true);
            if (!cont.success) {
              return { success: false, action, taskId, error: (cont as { message?: string }).message || 'Partial continue required', errorCode: ERROR_CODES.RESULT_PARTIAL_CONTINUE_REQUIRED };
            }
          }
          await daos.tasks.updateResult(taskId, result);
          // partial の記録
          try {
            if (resultMode === 'partial' && authorAgentId) {
              const md = (existing.metadata as Record<string, unknown> | undefined) || {};
              const updatedMd = { ...md, result: { ...(md.result as Record<string, unknown> || {}), partial: true, lastAuthor: authorAgentId, lastUpdatedAt: new Date().toISOString() } };
              await daos.tasks.updateMetadata(taskId, updatedMd);
            } else if (resultMode === 'final') {
              const md = (existing.metadata as Record<string, unknown> | undefined) || {};
              const updatedMd = { ...md, result: { ...(md.result as Record<string, unknown> || {}), partial: false } };
              await daos.tasks.updateMetadata(taskId, updatedMd);
              // オプション: 自動完了
              const autoComplete = (context as Record<string, unknown>)['autoCompleteFinal'] as boolean | undefined;
              if (autoComplete) {
                await daos.tasks.updateStatus(taskId, 'completed');
              }
            }
          } catch {}

          return {
            success: true,
            action,
            taskId,
            message: `Task ${taskId} result updated`,
          };
        }

        case 'complete_task': {
          if (!taskId) {
            return { success: false, action, error: 'Missing required field: taskId' };
          }
          const existing = await daos.tasks.findById(taskId);
          if (!existing) return { success: false, action, taskId, error: `Task ${taskId} not found`, errorCode: ERROR_CODES.TASK_NOT_FOUND };
          // Allow optional result & continuity checks
          const resultMode = ((context as Record<string, unknown>)['resultMode'] as 'final'|'partial'|undefined) || 'final';
          const authorAgentId = (context as Record<string, unknown>)['authorAgentId'] as string | undefined;
          if (result !== undefined) {
            if (resultMode === 'final' && authorAgentId) {
              const cont = checkPartialContinuity(existing, authorAgentId, true);
              if (!cont.success) return { success: false, action, taskId, error: (cont as { message?: string }).message || 'Partial continue required', errorCode: ERROR_CODES.RESULT_PARTIAL_CONTINUE_REQUIRED };
            }
            await daos.tasks.updateResult(taskId, result);
          }
          // Cannot complete if partial flag is set
          const md = (existing.metadata as Record<string, unknown> | undefined) || {};
          if ((md.result as Record<string, unknown> | undefined)?.partial) {
            return { success: false, action, taskId, error: 'Result is partial; require same worker to continue', errorCode: ERROR_CODES.RESULT_PARTIAL_CONTINUE_REQUIRED };
          }
          await daos.tasks.updateStatus(taskId, 'completed');
          return { success: true, action, taskId, message: `Task ${taskId} completed` };
        }

        case 'assign_worker': {
          if (!taskId || !workerId) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, workerId',
            };
          }
          const st = await requireStage(networkId, ['planning', 'executing']);
          if (!st.success) {
            return { success: false, action, taskId, error: (st as { message?: string }).message || 'Invalid stage', errorCode: ERROR_CODES.INVALID_STAGE };
          }
          const ex = await requireTaskExists(taskId);
          if (!ex.success) return { success: false, action, taskId, error: (ex as { message?: string }).message || 'Task not found', errorCode: ERROR_CODES.TASK_NOT_FOUND };
          await daos.tasks.assignWorker(taskId, workerId);

          return {
            success: true,
            action,
            taskId,
            message: `Task ${taskId} assigned to worker ${workerId}`,
          };
        }

        case 'get_task': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          const task = await daos.tasks.findById(taskId);
          
          if (!task) {
            return {
              success: false,
              action,
              taskId,
              error: `Task ${taskId} not found`,
              errorCode: ERROR_CODES.TASK_NOT_FOUND,
            };
          }

          return {
            success: true,
            action,
            taskId,
            task,
            message: `Retrieved task ${taskId}`,
          };
        }

        case 'list_network_tasks': {
          const tasks = await daos.tasks.findByNetworkId(networkId);
          
          return {
            success: true,
            action,
            tasks: tasks.map(t => ({
              taskId: t.task_id,
              status: t.status,
              taskType: t.task_type,
              description: t.task_description,
              progress: t.progress,
              priority: t.priority,
              assignedTo: t.assigned_to,
              createdAt: t.created_at,
              completedAt: t.completed_at,
              stepNumber: t.step_number,
              resultPartial: !!(((t.metadata as Record<string, unknown>)?.result as Record<string, unknown>)?.partial),
              lastAuthor: ((t.metadata as Record<string, unknown>)?.result as Record<string, unknown>)?.lastAuthor,
            })),
            message: `Found ${tasks.length} tasks in network ${networkId}`,
          };
        }

        case 'get_network_summary': {
          const summary = await daos.tasks.getNetworkSummary(networkId);
          
          return {
            success: true,
            action,
            summary,
            message: `Network ${networkId} summary retrieved`,
          };
        }

        case 'get_next_task': {
          const task = await daos.tasks.findNextQueuedByStep(networkId);
          if (!task) {
            return {
              success: true,
              action,
              task: null,
              message: `No queued tasks for network ${networkId}`,
            };
          }
          return {
            success: true,
            action,
            task: {
              taskId: task.task_id,
              taskType: task.task_type,
              description: task.task_description,
              stepNumber: task.step_number,
              createdAt: task.created_at,
              resultPartial: !!(((task.metadata as Record<string, unknown>)?.result as Record<string, unknown>)?.partial),
            },
            message: `Next task is ${task.task_id}`,
          };
        }

        case 'get_pending_tasks': {
          const tasks = await daos.tasks.findByNetworkAndStatus(networkId, 'queued');
          
          return {
            success: true,
            action,
            tasks: tasks.map(t => ({
              taskId: t.task_id,
              taskType: t.task_type,
              description: t.task_description,
              stepNumber: t.step_number,
              createdAt: t.created_at,
            })),
            message: `Found ${tasks.length} pending tasks in network ${networkId}`,
          };
        }

        case 'delete_tasks_from_step': {
          if (!context.fromStepNumber) {
            return {
              success: false,
              action,
              error: 'Missing required field: fromStepNumber',
            };
          }
          // planningのみ許可（実行後は不可）
          const st = await requireStage(networkId, ['planning']);
          if (!st.success) {
            return { success: false, action, error: (st as { message?: string }).message || 'Stage check failed', errorCode: ERROR_CODES.INVALID_STAGE };
          }
          await daos.tasks.deleteTasksFromStep(networkId, context.fromStepNumber);
          return {
            success: true,
            action,
            message: `Deleted tasks from step ${context.fromStepNumber} (inclusive) for network ${networkId}, excluding completed tasks`,
          };
        }

        default:
          return {
            success: false,
            action,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      console.error('Task Management Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});
