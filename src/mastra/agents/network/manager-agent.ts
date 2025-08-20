import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../../shared-memory';
// Task management tools
import { taskManagementTool } from '../../task-management/tools/task-management-tool';
import { batchTaskCreationTool } from '../../task-management/tools/batch-task-creation-tool';
import { directiveManagementTool } from '../../task-management/tools/directive-management-tool';
import { policyCheckTool } from '../../task-management/tools/policy-management-tool';
import { getAgentPrompt } from '../../prompts/agent-prompts';
import { getSystemContext, SystemContext } from '../../utils/shared-context';
import { resolveModel } from '../../config/model-registry';

// モデルを動的に作成する関数
export function createManagerAgent(modelType: string = 'claude-sonnet-4', systemContext?: SystemContext): Agent {
  const { aiModel } = resolveModel(modelType);
  
  // システムコンテキストを取得（指定がなければ現在のコンテキストを使用）
  const context = systemContext || getSystemContext();
  
  return new Agent({
    name: 'Manager Agent - Task Planner & Coordinator',
    instructions: getAgentPrompt('MANAGER', context),
    model: aiModel,
    tools: {
      taskManagementTool,
      batchTaskCreationTool,
      directiveManagementTool,
      policyCheckTool,
    },
    memory: sharedMemory,
  });
}

// 互換性のためのデフォルトエクスポート
export const managerAgent = createManagerAgent();