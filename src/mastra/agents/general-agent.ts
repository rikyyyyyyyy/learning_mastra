import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { getToolsForRole } from '../config/tool-registry';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { resolveModel } from '../config/model-registry';

// モデルを動的に作成する関数
export function createGeneralAgent(modelType: string = 'claude-sonnet-4'): Agent {
  const { aiModel, info: modelInfo } = resolveModel(modelType);
  
  console.log(`🤖 AIモデル設定: ${modelInfo.displayName} (${modelInfo.provider} - ${modelInfo.modelId})`);
  
  // モデル情報を詳細にログ出力（Mastraの内部ログを補完）
  console.log(`[Mastra Debug] model=${modelInfo.modelId} provider=${modelInfo.provider}`);

  const agent = new Agent({
    name: 'General AI Assistant',
    instructions: getAgentPrompt('GENERAL'),
    model: aiModel,
    tools: getToolsForRole('GENERAL') as unknown as never,
    memory: sharedMemory,
  });
  
  // エージェントにモデル情報を附加（ログ用）
  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = modelInfo;
  
  return agent;
}

// 互換性のためにデフォルトエクスポートを保持
export const generalAgent = createGeneralAgent();