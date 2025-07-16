import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// CEO → Manager への委譲ツール
export const managerDelegationTool = createTool({
  id: 'delegate-to-manager',
  description: 'Delegate task planning and coordination to the Manager agent',
  inputSchema: z.object({
    taskDescription: z.string().describe('The task that needs to be planned and executed'),
    strategicDirection: z.string().describe('Strategic guidance from CEO for the task'),
    constraints: z.any().optional().describe('Any constraints or requirements'),
    expectedOutcome: z.string().describe('The expected outcome or deliverable'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  }),
  outputSchema: z.object({
    delegated: z.boolean(),
    managerId: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { taskDescription, strategicDirection, priority } = context;
    
    console.log('👔 CEO → Manager 委譲:', {
      task: taskDescription,
      priority,
    });

    // Note: In the actual implementation within AgentNetwork,
    // this tool will trigger the Manager agent through the network's internal routing
    // For now, we return a confirmation that delegation was initiated
    
    return {
      delegated: true,
      managerId: 'manager-agent',
      message: `Task delegated to Manager for detailed planning. Strategic direction: ${strategicDirection}`,
    };
  },
});