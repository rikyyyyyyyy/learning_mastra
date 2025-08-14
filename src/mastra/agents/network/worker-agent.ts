import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { sharedMemory } from '../../shared-memory';
import { exaMCPSearchTool } from '../../tools/exa-search-wrapper';
import { docsReaderTool } from '../../tools/docs-reader-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';

export const workerAgent = new Agent({
  name: 'Worker Agent - Task Executor',
  instructions: getAgentPrompt('WORKER'),
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { 
    exaMCPSearchTool,
    docsReaderTool,
    // Additional tools can be added here as the system grows
  },
  memory: sharedMemory,
});