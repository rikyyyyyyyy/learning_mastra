import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Manager → Worker への作業割り当てツール
export const workerAssignmentTool = createTool({
  id: 'assign-to-worker',
  description: 'Assign specific tasks to Worker agents for execution',
  inputSchema: z.object({
    taskId: z.string().describe('Unique identifier for this task'),
    taskType: z.enum(['search', 'weather', 'content-generation', 'data-processing', 'other']),
    taskDescription: z.string().describe('Detailed description of the task to execute'),
    requiredTools: z.array(z.string()).optional().describe('List of tools needed for this task'),
    inputData: z.any().describe('Specific input data for the task'),
    expectedOutput: z.object({
      format: z.string().describe('Expected output format'),
      requirements: z.array(z.string()).optional().describe('Specific requirements for the output'),
    }),
    deadline: z.string().optional().describe('Task deadline if applicable'),
  }),
  outputSchema: z.object({
    assigned: z.boolean(),
    workerId: z.string(),
    taskId: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { taskId, taskType, requiredTools } = context;
    
    console.log('📋 Manager → Worker 作業割り当て:', {
      taskId,
      taskType,
      requiredTools,
    });

    // Note: In the actual implementation within AgentNetwork,
    // this tool will trigger the Worker agent through the network's internal routing
    // For now, we return a confirmation that the task was assigned
    
    return {
      assigned: true,
      workerId: 'worker-agent',
      taskId,
      message: `Task ${taskId} assigned to Worker for ${taskType} execution`,
    };
  },
});