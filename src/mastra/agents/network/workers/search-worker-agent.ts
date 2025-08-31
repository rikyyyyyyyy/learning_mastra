import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../../../shared-memory';
import { getAgentPrompt } from '../../../prompts/agent-prompts';
import { resolveModel, resolveModelWithOptions } from '../../../config/model-registry';
import { SystemContext } from '../../../utils/shared-context';

// Tools
import { exaMCPSearchTool } from '../../../tools/exa-search-wrapper';
import { docsReaderTool } from '../../../tools/docs-reader-tool';
import { taskManagementTool } from '../../../task-management/tools/task-management-tool';

export function createSearchWorkerAgent(
  modelKey: string = 'claude-sonnet-4',
  systemContext?: SystemContext,
  modelOptions?: Record<string, unknown>,
  memory?: unknown,
): Agent {
  const { aiModel } = modelOptions
    ? resolveModelWithOptions(modelKey, modelOptions)
    : resolveModel(modelKey);

  return new Agent({
    name: 'Search Worker - Web & Docs Researcher',
    instructions: getAgentPrompt('WORKER', systemContext),
    model: aiModel,
    tools: {
      exaMCPSearchTool,
      docsReaderTool,
      taskManagementTool,
    } as unknown as never,
    memory: ((() => (memory ?? sharedMemory)) as unknown) as never,
  });
}
