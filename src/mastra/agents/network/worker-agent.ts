import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../../shared-memory';
import { exaMCPSearchTool } from '../../tools/exa-search-wrapper';
import { docsReaderTool } from '../../tools/docs-reader-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';
import { taskManagementTool } from '../../task-management/tools/task-management-tool';
import { getSystemContext, SystemContext } from '../../utils/shared-context';
import { resolveModel } from '../../config/model-registry';

// モデルを動的に作成する関数
export function createWorkerAgent(modelType: string = 'claude-sonnet-4', systemContext?: SystemContext): Agent {
  const { aiModel } = resolveModel(modelType);
  
  // システムコンテキストを取得（指定がなければ現在のコンテキストを使用）
  const context = systemContext || getSystemContext();
  
  return new Agent({
    name: 'Worker Agent - Task Executor',
    instructions: getAgentPrompt('WORKER', context),
    model: aiModel,
    tools: { 
      exaMCPSearchTool,
      docsReaderTool,
      taskManagementTool,
      // Additional tools can be added here as the system grows
    },
    memory: sharedMemory,
  });
}

// 互換性のためのデフォルトエクスポート
export const workerAgent = createWorkerAgent();
