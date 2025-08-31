import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../../../shared-memory';
import { getAgentPrompt } from '../../../prompts/agent-prompts';
import { resolveModel, resolveModelWithOptions } from '../../../config/model-registry';
import { SystemContext } from '../../../utils/shared-context';

// Tools more suitable for code/artifact work
import { artifactIOTool } from '../../../task-management/tools/artifact-io-tool';
import { artifactDiffTool } from '../../../task-management/tools/artifact-diff-tool';
import { contentStoreTool } from '../../../task-management/tools/content-store-tool';
import { taskManagementTool } from '../../../task-management/tools/task-management-tool';
import { docsReaderTool } from '../../../tools/docs-reader-tool';

export function createCodeWorkerAgent(
  modelKey: string = 'claude-sonnet-4',
  systemContext?: SystemContext,
  modelOptions?: Record<string, unknown>,
  memory?: unknown,
): Agent {
  const { aiModel } = modelOptions
    ? resolveModelWithOptions(modelKey, modelOptions)
    : resolveModel(modelKey);

  return new Agent({
    name: 'Code Worker - Artifact & Implementation',
    instructions: getAgentPrompt('WORKER', systemContext),
    model: aiModel,
    tools: {
      artifactIOTool,
      artifactDiffTool,
      contentStoreTool,
      taskManagementTool,
      docsReaderTool,
    } as unknown as never,
    memory: ((() => (memory ?? sharedMemory)) as unknown) as never,
  });
}
