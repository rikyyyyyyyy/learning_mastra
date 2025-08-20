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
      
      // 既存タスクのチェック - 同じネットワークIDで既にタスクが存在する場合はスキップ
      const existingTasks = await daos.tasks.findByNetworkId(networkId);
      if (existingTasks.length > 0) {
        console.log(`⚠️ Tasks already exist for network ${networkId}. Found ${existingTasks.length} existing tasks.`);
        
        // 既存タスクのステップ番号を取得
        const existingSteps = new Set(existingTasks.map(t => t.step_number).filter(s => s !== undefined && s !== null));
        
        // 新しいタスクから既存のステップ番号を除外
        const newTasks = tasks.filter(t => !existingSteps.has(t.stepNumber));
        
        if (newTasks.length === 0) {
          console.log(`ℹ️ All tasks already exist for network ${networkId}. Skipping creation.`);
          return {
            success: true,
            createdTasks: existingTasks.map(t => ({
              taskId: t.task_id,
              taskType: t.task_type,
              stepNumber: t.step_number,
            })),
            networkId,
            totalTasks: existingTasks.length,
            message: `Using existing ${existingTasks.length} tasks for network ${networkId}`,
          };
        }
        
        console.log(`📝 Creating ${newTasks.length} new tasks (${tasks.length - newTasks.length} already exist)`);
        // 新しいタスクのみを処理対象とする
        tasks.splice(0, tasks.length, ...newTasks);
      }
      
      // Ensure response time < 100ms by using setTimeout for actual creation
      const createdTaskIds: Array<{ taskId: string; taskType: string; stepNumber?: number }> = [];
      // const taskPromises: Promise<void>[] = [];
      
      // Prepare task data synchronously
      const timestamp = Date.now();
      const taskDataList = tasks.map((task, index) => {
        // より確実にユニークなIDを生成（タイムスタンプ + インデックス + ランダム文字列）
        const taskId = `task-${networkId}-s${task.stepNumber || index + 1}-${timestamp}-${index.toString().padStart(3, '0')}-${Math.random().toString(36).substring(2, 8)}`;
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
          step_number: task.stepNumber || index + 1,
          depends_on: task.dependsOn,
          metadata: {
            ...task.metadata,
            estimatedTime: task.estimatedTime,
            batchCreated: true,
            batchSize: tasks.length,
          },
          // 小タスクでは優先度タグは利用しないが、型・DB整合のため固定値を保存
          priority: 'medium' as const,
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