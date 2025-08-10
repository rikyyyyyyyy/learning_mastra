import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
// Task management tools
import { taskManagementTool } from '../../task-management/tools/task-management-tool';
import { batchTaskCreationTool } from '../../task-management/tools/batch-task-creation-tool';
import { directiveManagementTool } from '../../task-management/tools/directive-management-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';

export const managerAgent = new Agent({
  name: 'Manager Agent - Task Planner & Coordinator',
  instructions: getAgentPrompt('MANAGER'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {
    taskManagementTool,
    batchTaskCreationTool,
    directiveManagementTool,
  },
  memory: sharedMemory,
});