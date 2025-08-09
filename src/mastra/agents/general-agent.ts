import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { agentNetworkTool } from '../tools/agent-network-tool';
import { slidePreviewTool } from '../tools/slide-preview-tool';
import { jobStatusTool } from '../tools/job-status-tool';
import { jobResultTool } from '../tools/job-result-tool';
// Task management tools
import { taskRegistryTool } from '../task-management/tools/task-registry-tool';
import { artifactStoreTool } from '../task-management/tools/artifact-store-tool';
import { taskCommunicationTool } from '../task-management/tools/task-communication-tool';
import { taskDiscoveryTool } from '../task-management/tools/task-discovery-tool';
import { LanguageModel } from 'ai';
import { getAgentPrompt } from '../prompts/agent-prompts';

// モデルを動的に作成する関数
export function createGeneralAgent(modelType: string = 'claude-sonnet-4'): Agent {
  // モデルに応じて適切なAI SDKを選択
  let aiModel: LanguageModel;
  let modelInfo: { provider: string; modelId: string; displayName: string };
  
  switch (modelType) {
    case 'openai-o3':
      aiModel = openai('o3-2025-04-16');
      modelInfo = { provider: 'OpenAI', modelId: 'o3-2025-04-16', displayName: 'OpenAI o3' };
      break;
    case 'gemini-2.5-flash':
      aiModel = google('gemini-2.5-flash');
      modelInfo = { provider: 'Google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' };
      break;
    case 'claude-sonnet-4':
    default:
      aiModel = anthropic('claude-sonnet-4-20250514');
      modelInfo = { provider: 'Anthropic', modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' };
      break;
  }
  
  console.log(`🤖 AIモデル設定: ${modelInfo.displayName} (${modelInfo.provider} - ${modelInfo.modelId})`);
  
  // モデル情報を詳細にログ出力（Mastraの内部ログを補完）
  console.log(`[Mastra Debug] model=${modelInfo.modelId} provider=${modelInfo.provider}`);

  const agent = new Agent({
    name: 'General AI Assistant',
    instructions: getAgentPrompt('GENERAL'),
    model: aiModel,
    tools: { 
      agentNetworkTool, 
      slidePreviewTool, 
      jobStatusTool, 
      jobResultTool,
      // Task management tools
      taskRegistryTool,
      artifactStoreTool,
      taskCommunicationTool,
      taskDiscoveryTool,
    },
    memory: sharedMemory,
  });
  
  // エージェントにモデル情報を附加（ログ用）
  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = modelInfo;
  
  return agent;
}

// 互換性のためにデフォルトエクスポートを保持
export const generalAgent = createGeneralAgent();