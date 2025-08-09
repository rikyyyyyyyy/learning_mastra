import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
import { TaskStatus } from '../db/schema';

// Task Registry Tool - タスクの登録・更新・ステータス管理
export const taskRegistryTool = createTool({
  id: 'task-registry',
  description: 'Register, update, and manage task status in the distributed task management system',
  inputSchema: z.object({
    action: z.enum(['register', 'update_status', 'get_status', 'list_running', 'get_task']),
    taskId: z.string().optional().describe('Task ID for operations that require it'),
    taskData: z.object({
      parentJobId: z.string().optional(),
      networkType: z.string().default('CEO-Manager-Worker'),
      taskType: z.string().optional(),
      taskDescription: z.string().optional(),
      taskParameters: z.any().optional(),
      createdBy: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      metadata: z.record(z.any()).optional(),
    }).optional().describe('Data for registering a new task'),
    status: TaskStatus.optional().describe('New status for update operations'),
    metadata: z.record(z.any()).optional().describe('Metadata to update'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    taskId: z.string().optional(),
    task: z.any().optional(),
    tasks: z.array(z.any()).optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    
    try {
      const { action, taskId, taskData, status } = context;
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Task Registry Tool approaching timeout limit');
      }

      switch (action) {
        case 'register': {
          if (!taskData?.taskType || !taskData?.taskDescription || !taskData?.createdBy) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskType, taskDescription, createdBy',
            };
          }

          const newTaskId = taskId || `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          
          const newTask = await daos.tasks.create({
            task_id: newTaskId,
            network_id: taskData.parentJobId || newTaskId, // Use parentJobId as network_id or taskId itself
            parent_job_id: taskData.parentJobId,
            network_type: taskData.networkType,
            status: 'queued',
            task_type: taskData.taskType,
            task_description: taskData.taskDescription,
            task_parameters: taskData.taskParameters,
            progress: 0,
            created_by: taskData.createdBy,
            priority: taskData.priority,
            metadata: taskData.metadata,
          });

          return {
            success: true,
            action,
            taskId: newTaskId,
            task: newTask,
            message: `Task registered successfully with ID: ${newTaskId}`,
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

        case 'get_status': {
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
            task: {
              status: task.status,
              taskType: task.task_type,
              createdAt: task.created_at,
              updatedAt: task.updated_at,
              completedAt: task.completed_at,
            },
            message: `Task ${taskId} status: ${task.status}`,
          };
        }

        case 'list_running': {
          const runningTasks = await daos.tasks.findByStatus('running');
          const queuedTasks = await daos.tasks.findByStatus('queued');
          const allTasks = [...runningTasks, ...queuedTasks];
          
          return {
            success: true,
            action,
            tasks: allTasks.map(t => ({
              taskId: t.task_id,
              status: t.status,
              taskType: t.task_type,
              priority: t.priority,
              createdBy: t.created_by,
              createdAt: t.created_at,
            })),
            message: `Found ${allTasks.length} running/queued tasks`,
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

        default:
          return {
            success: false,
            action,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      console.error('Task Registry Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});