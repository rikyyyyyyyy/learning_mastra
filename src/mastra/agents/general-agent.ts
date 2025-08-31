import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { getToolsForRole } from '../config/tool-registry';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { resolveModel, resolveModelWithOptions } from '../config/model-registry';
import { getSystemContext } from '../utils/shared-context';

// モデルを動的に作成する関数
// modelOptions: OpenAIモデル向けの追加パラメータ（reasoning等）
export function createGeneralAgent(
  modelType: string = 'claude-sonnet-4',
  _toolMode: 'workflow' | 'both' = 'workflow',
  modelOptions?: Record<string, unknown>
): Agent {
  void _toolMode; // Parameter kept for function signature compatibility
  const { aiModel, info: modelInfo } = modelOptions
    ? resolveModelWithOptions(modelType, modelOptions)
    : resolveModel(modelType);
  
  console.log(`🤖 AIモデル設定: ${modelInfo.displayName} (${modelInfo.provider} - ${modelInfo.modelId})`);
  
  // モデル情報を詳細にログ出力（Mastraの内部ログを補完）
  console.log(`[Mastra Debug] model=${modelInfo.modelId} provider=${modelInfo.provider}`);

  const allTools = getToolsForRole('GENERAL') as Record<string, unknown>;
  const filteredTools = Object.fromEntries(
    Object.entries(allTools).filter(([key]) => (
      key === 'workflowOrchestratorTool' || key === 'slidePreviewTool' || key === 'jobStatusTool' || key === 'jobResultTool' || key === 'taskRegistryTool' || key === 'directiveManagementTool' || key === 'docsReaderTool'
    ))
  );

  // システムコンテキストを取得してプロンプトに注入
  const systemContext = getSystemContext();
  
  const agent = new Agent({
    name: 'General AI Assistant',
    instructions: getAgentPrompt('GENERAL', systemContext),
    model: aiModel,
    tools: filteredTools as unknown as never,
    memory: sharedMemory,
  });
  
  // エージェントにモデル情報を附加（ログ用）
  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = modelInfo;
  
  return agent;
}

// 互換性のためにデフォルトエクスポートを保持
export const generalAgent = createGeneralAgent();
