import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
import { getAgentPrompt } from '../../prompts/agent-prompts';

export const ceoAgent = new Agent({
  name: 'CEO Agent - Strategic Task Director',
  instructions: getAgentPrompt('CEO'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {},
  memory: sharedMemory,
});