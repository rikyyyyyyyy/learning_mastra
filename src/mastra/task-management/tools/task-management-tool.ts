import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
import { TaskStatus } from '../db/schema';

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
    ]),
    networkId: z.string().describe('Network ID for the agent network'),
    taskId: z.string().optional().describe('Task ID for operations that require it'),
    taskData: z.object({
      taskType: z.string().optional(),
      taskDescription: z.string().optional(),
      taskParameters: z.any().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      metadata: z.record(z.any()).optional(),
    }).optional().describe('Data for creating a new task'),
    status: TaskStatus.optional().describe('New status for update operations'),
    progress: z.number().min(0).max(100).optional().describe('Progress percentage'),
    result: z.any().optional().describe('Task execution result'),
    workerId: z.string().optional().describe('Worker ID for assignment'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    taskId: z.string().optional(),
    task: z.any().optional(),
    tasks: z.array(z.any()).optional(),
    summary: z.any().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
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
            priority: taskData.priority,
            metadata: taskData.metadata,
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

          await daos.tasks.updateResult(taskId, result);

          return {
            success: true,
            action,
            taskId,
            message: `Task ${taskId} result updated`,
          };
        }

        case 'assign_worker': {
          if (!taskId || !workerId) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, workerId',
            };
          }

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
              priority: task.priority,
              createdAt: task.created_at,
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
              priority: t.priority,
              createdAt: t.created_at,
            })),
            message: `Found ${tasks.length} pending tasks in network ${networkId}`,
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