import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
import { getAgentPrompt } from '../../prompts/agent-prompts';
import { taskViewerTool } from '../../task-management/tools/task-viewer-tool';
import { finalResultTool } from '../../task-management/tools/final-result-tool';
import { policyManagementTool } from '../../task-management/tools/policy-management-tool';

export const ceoAgent = new Agent({
  name: 'CEO Agent - Strategic Task Director',
  instructions: getAgentPrompt('CEO'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {
    taskViewerTool,
    finalResultTool,
    policyManagementTool,
  },
  memory: sharedMemory,
});