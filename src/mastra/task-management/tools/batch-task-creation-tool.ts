import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
// import { NetworkTask } from '../db/schema';

// バッチタスク作成ツール - Manager用の一括タスク作成
export const batchTaskCreationTool = createTool({
  id: 'batch-task-creation',
  description: 'Create multiple tasks at once for a network with dependencies and step ordering',
  inputSchema: z.object({
    networkId: z.string().describe('Network ID for the agent network'),
    parentJobId: z.string().optional().describe('Parent job ID for tracking'),
    tasks: z.array(z.object({
      taskType: z.string(),
      taskDescription: z.string(),
      taskParameters: z.any().optional(),
      priority: z.enum(['low', 'medium', 'high']).default('medium'),
      stepNumber: z.number().optional(),
      dependsOn: z.array(z.string()).optional(),
      estimatedTime: z.number().optional().describe('Estimated time in seconds'),
      metadata: z.record(z.any()).optional(),
    })).describe('Array of tasks to create'),
    autoAssign: z.boolean().default(false).describe('Automatically assign workers based on task type'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    createdTasks: z.array(z.object({
      taskId: z.string(),
      taskType: z.string(),
      stepNumber: z.number().optional(),
    })).optional(),
    networkId: z.string(),
    totalTasks: z.number(),
    message: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    // const startTime = Date.now();
    
    try {
      const { networkId, parentJobId, tasks, autoAssign } = context;

      // networkId 一貫性チェック: runtimeContext.currentJobId が存在すれば照合
      try {
        const currentJobId = (runtimeContext as { get?: (key: string) => unknown })?.get?.('currentJobId') as string | undefined;
        if (currentJobId && currentJobId !== networkId) {
          return {
            success: false,
            createdTasks: [],
            networkId,
            totalTasks: 0,
            message: `Network ID mismatch. expected=${currentJobId} received=${networkId}`,
          };
        }
      } catch {
        // 取得失敗時はスキップ（後方互換）
      }
      const daos = getDAOs();
      
      // Ensure response time < 100ms by using setTimeout for actual creation
      const createdTaskIds: Array<{ taskId: string; taskType: string; stepNumber?: number }> = [];
      // const taskPromises: Promise<void>[] = [];
      
      // Prepare task data synchronously
      const taskDataList = tasks.map((task, index) => {
        const taskId = `task-${networkId}-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 8)}`;
        createdTaskIds.push({ 
          taskId, 
          taskType: task.taskType,
          stepNumber: task.stepNumber || index + 1
        });
        
        return {
          task_id: taskId,
          network_id: networkId,
          parent_job_id: parentJobId,
          network_type: 'CEO-Manager-Worker',
          status: 'queued' as const,
          task_type: task.taskType,
          task_description: task.taskDescription,
          task_parameters: task.taskParameters,
          progress: 0,
          created_by: 'manager-agent',
          assigned_to: autoAssign ? getWorkerForTaskType(task.taskType) : undefined,
          priority: task.priority,
          step_number: task.stepNumber || index + 1,
          depends_on: task.dependsOn,
          metadata: {
            ...task.metadata,
            estimatedTime: task.estimatedTime,
            batchCreated: true,
            batchSize: tasks.length,
          },
        };
      });
      
      // 同期で作成（ワークフロー/ネットワークが直後に利用できるようにする）
      const results = await Promise.all(
        taskDataList.map(taskData =>
          daos.tasks.create(taskData).catch(err => {
            console.error(`Failed to create task ${taskData.task_id}:`, err);
            return null;
          })
        )
      );

      const successCount = results.filter(r => r !== null).length;
      console.log(`✅ Batch created ${successCount}/${taskDataList.length} tasks for network ${networkId}`);

      // Update network metadata with task plan（存在しない場合は無視）
      try {
        const networkSummary = {
          totalTasks: taskDataList.length,
          taskPlan: taskDataList.map(t => ({
            step: t.step_number,
            type: t.task_type,
            description: t.task_description,
            priority: t.priority,
            dependsOn: t.depends_on,
          })),
          createdAt: new Date().toISOString(),
        };
        await daos.tasks.updateMetadata?.(networkId, networkSummary as unknown as Record<string, unknown>);
      } catch (err) {
        console.error('Failed to update network metadata:', err);
      }

      return {
        success: true,
        createdTasks: createdTaskIds,
        networkId,
        totalTasks: successCount,
        message: `Batch created ${successCount} tasks in network ${networkId}`,
      };
      
    } catch (error) {
      console.error('Batch Task Creation Tool error:', error);
      return {
        success: false,
        networkId: context.networkId,
        totalTasks: 0,
        message: 'Failed to initiate batch task creation',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});

// Helper function to determine worker assignment based on task type
function getWorkerForTaskType(taskType: string): string | undefined {
  const taskTypeMapping: Record<string, string> = {
    'web-search': 'worker-search-agent',
    'research': 'worker-research-agent',
    'code-generation': 'worker-code-agent',
    'slide-generation': 'worker-slide-agent',
    'analysis': 'worker-analysis-agent',
    'report': 'worker-report-agent',
    'data-processing': 'worker-data-agent',
    'content-creation': 'worker-content-agent',
  };
  
  return taskTypeMapping[taskType.toLowerCase()] || 'worker-agent';
}