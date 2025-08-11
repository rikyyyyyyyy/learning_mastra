import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';

/**
 * CEOエージェント専用ツール
 * タスク管理DBから小タスクの結果を閲覧（読み取り専用）
 */
export const taskViewerTool = createTool({
  id: 'task-viewer',
  description: 'View completed tasks and their results from the task management database (CEO Agent read-only)',
  inputSchema: z.object({
    action: z.enum([
      'view_all_tasks',           // ネットワーク内の全タスクを表示
      'view_completed_tasks',     // 完了したタスクのみ表示
      'view_task_results',        // タスクの結果を詳細表示
      'get_network_summary',      // ネットワークのサマリー取得
    ]).describe('Action to perform'),
    networkId: z.string().describe('Network ID to view tasks for'),
    taskId: z.string().optional().describe('Specific task ID for detailed view'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    data: z.any().optional(),
    summary: z.any().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { action, networkId, taskId } = context;
    
    try {
      const daos = getDAOs();
      
      switch (action) {
        case 'view_all_tasks': {
          const tasks = await daos.tasks.findByNetworkId(networkId);
          
          // メインタスクを除外（step_numberがnullまたはundefinedのもの）
          const subTasks = tasks.filter(t => t.step_number !== null && t.step_number !== undefined);
          
          return {
            success: true,
            action,
            data: subTasks.map(t => ({
              taskId: t.task_id,
              stepNumber: t.step_number,
              status: t.status,
              taskType: t.task_type,
              description: t.task_description,
              parameters: t.task_parameters,
              result: t.task_result,
              progress: t.progress,
              priority: t.priority,
              assignedTo: t.assigned_to,
              createdAt: t.created_at,
              completedAt: t.completed_at,
              executionTime: t.execution_time,
            })),
            message: `Found ${subTasks.length} sub-tasks in network ${networkId}`,
          };
        }
        
        case 'view_completed_tasks': {
          const tasks = await daos.tasks.findByNetworkAndStatus(networkId, 'completed');
          
          // メインタスクを除外
          const completedSubTasks = tasks.filter(t => t.step_number !== null && t.step_number !== undefined);
          
          // ステップ番号でソート
          completedSubTasks.sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
          
          return {
            success: true,
            action,
            data: completedSubTasks.map(t => ({
              taskId: t.task_id,
              stepNumber: t.step_number,
              taskType: t.task_type,
              description: t.task_description,
              result: t.task_result,
              completedAt: t.completed_at,
              executionTime: t.execution_time,
            })),
            message: `Found ${completedSubTasks.length} completed sub-tasks in network ${networkId}`,
          };
        }
        
        case 'view_task_results': {
          if (!taskId) {
            // taskIdが指定されていない場合は、全完了タスクの結果を取得
            const tasks = await daos.tasks.findByNetworkAndStatus(networkId, 'completed');
            const completedSubTasks = tasks.filter(t => t.step_number !== null && t.step_number !== undefined);
            completedSubTasks.sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
            
            const results = completedSubTasks.map(t => ({
              taskId: t.task_id,
              stepNumber: t.step_number,
              taskType: t.task_type,
              description: t.task_description,
              result: t.task_result,
            }));
            
            return {
              success: true,
              action,
              data: results,
              message: `Retrieved results for ${results.length} completed sub-tasks`,
            };
          } else {
            // 特定のタスクの詳細結果を取得
            const task = await daos.tasks.findById(taskId);
            
            if (!task) {
              return {
                success: false,
                action,
                message: `Task ${taskId} not found`,
              };
            }
            
            return {
              success: true,
              action,
              data: {
                taskId: task.task_id,
                stepNumber: task.step_number,
                status: task.status,
                taskType: task.task_type,
                description: task.task_description,
                parameters: task.task_parameters,
                result: task.task_result,
                progress: task.progress,
                completedAt: task.completed_at,
                executionTime: task.execution_time,
              },
              message: `Retrieved detailed result for task ${taskId}`,
            };
          }
        }
        
        case 'get_network_summary': {
          // const summary = await daos.tasks.getNetworkSummary(networkId);
          const tasks = await daos.tasks.findByNetworkId(networkId);
          
          // メインタスクを除外
          const subTasks = tasks.filter(t => t.step_number !== null && t.step_number !== undefined);
          
          // 完了したタスクの結果を集計
          const completedTasks = subTasks.filter(t => t.status === 'completed');
          
          return {
            success: true,
            action,
            summary: {
              networkId,
              totalSubTasks: subTasks.length,
              completedSubTasks: completedTasks.length,
              progressPercentage: subTasks.length > 0 
                ? Math.round((completedTasks.length / subTasks.length) * 100) 
                : 0,
              tasksByStatus: {
                queued: subTasks.filter(t => t.status === 'queued').length,
                running: subTasks.filter(t => t.status === 'running').length,
                completed: completedTasks.length,
                failed: subTasks.filter(t => t.status === 'failed').length,
              },
              completedResults: completedTasks.map(t => ({
                stepNumber: t.step_number,
                taskType: t.task_type,
                description: t.task_description,
                hasResult: !!t.task_result,
              })),
            },
            message: `Network summary retrieved for ${networkId}`,
          };
        }
        
        default:
          return {
            success: false,
            action,
            message: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      console.error('Task Viewer Tool error:', error);
      return {
        success: false,
        action: context.action,
        message: `Error viewing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});