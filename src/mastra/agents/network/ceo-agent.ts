import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../../shared-memory';
import { getAgentPrompt } from '../../prompts/agent-prompts';
import { taskViewerTool } from '../../task-management/tools/task-viewer-tool';
import { finalResultTool } from '../../task-management/tools/final-result-tool';
import { policyManagementTool } from '../../task-management/tools/policy-management-tool';
import { getSystemContext, SystemContext } from '../../utils/shared-context';
import { resolveModel } from '../../config/model-registry';

// モデルを動的に作成する関数
export function createCeoAgent(modelType: string = 'claude-sonnet-4', systemContext?: SystemContext): Agent {
  const { aiModel } = resolveModel(modelType);
  
  // システムコンテキストを取得（指定がなければ現在のコンテキストを使用）
  const context = systemContext || getSystemContext();
  
  return new Agent({
    name: 'CEO Agent - Strategic Task Director',
    instructions: getAgentPrompt('CEO', context),
    model: aiModel,
    tools: {
      taskViewerTool,
      finalResultTool,
      policyManagementTool,
    },
    memory: sharedMemory,
  });
}

// 互換性のためのデフォルトエクスポート
export const ceoAgent = createCeoAgent();