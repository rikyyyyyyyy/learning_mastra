import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
// Task management tools
import { taskRegistryTool } from '../../task-management/tools/task-registry-tool';
import { artifactStoreTool } from '../../task-management/tools/artifact-store-tool';
import { taskDiscoveryTool } from '../../task-management/tools/task-discovery-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';

export const managerAgent = new Agent({
  name: 'Manager Agent - Task Planner & Coordinator',
  instructions: getAgentPrompt('MANAGER'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {
    taskRegistryTool,
    artifactStoreTool,
    taskDiscoveryTool,
  },
  memory: sharedMemory,
});