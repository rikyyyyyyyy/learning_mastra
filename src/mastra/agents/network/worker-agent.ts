import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
import { exaMCPSearchTool } from '../../tools/exa-search-wrapper';
// Task management tools
import { artifactStoreTool } from '../../task-management/tools/artifact-store-tool';
import { taskCommunicationTool } from '../../task-management/tools/task-communication-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';

export const workerAgent = new Agent({
  name: 'Worker Agent - Task Executor',
  instructions: getAgentPrompt('WORKER'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { 
    exaMCPSearchTool,
    artifactStoreTool,
    taskCommunicationTool,
    // Additional tools can be added here as the system grows
  },
  memory: sharedMemory,
});