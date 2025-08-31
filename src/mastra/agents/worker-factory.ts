import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { resolveModel, resolveModelWithOptions } from '../config/model-registry';

// 必須ツール（常時注入）
import { artifactIOTool } from '../task-management/tools/artifact-io-tool';
import { artifactDiffTool } from '../task-management/tools/artifact-diff-tool';
import { contentStoreTool } from '../task-management/tools/content-store-tool';
import { taskManagementTool } from '../task-management/tools/task-management-tool';
import { docsReaderTool } from '../tools/docs-reader-tool';
import { subtaskArtifactTool } from '../task-management/tools/subtask-artifact-bridge-tool';
// 任意（トグル）
import { exaMCPSearchTool } from '../tools/exa-search-wrapper';
import { createCustomMCPTool, CustomMCPServer } from '../tools/custom-mcp-tool';

export type WorkerMetadata = {
  mcp?: { exa?: { enabled?: boolean }, custom?: CustomMCPServer[] }
};

export function createWorkerFromDefinition(
  def: { id: string; name: string; model_key?: string; prompt_text?: string; metadata?: WorkerMetadata },
  modelOptions?: Record<string, unknown>
): Agent {
  const { aiModel } = modelOptions
    ? resolveModelWithOptions(def.model_key, modelOptions)
    : resolveModel(def.model_key);

  // ベース＋追加プロンプト
  const base = getAgentPrompt('WORKER');
  const instructions = def.prompt_text ? `${base}\n\n【追加指示】\n${def.prompt_text}` : base;

  // ツール集合（必須＋任意）
  const tools: Record<string, unknown> = {
    artifactIOTool,
    artifactDiffTool,
    contentStoreTool,
    taskManagementTool,
    docsReaderTool,
    subtaskArtifactTool,
  };
  if (def.metadata?.mcp?.exa?.enabled) {
    (tools as Record<string, unknown>).exaMCPSearchTool = exaMCPSearchTool;
  }
  if (def.metadata?.mcp?.custom && def.metadata.mcp.custom.length > 0) {
    (tools as Record<string, unknown>).customMCPTool = createCustomMCPTool(def.metadata.mcp.custom);
  }

  return new Agent({
    name: def.name || 'Worker Agent',
    instructions,
    model: aiModel,
    tools: tools as unknown as never,
    memory: ((() => sharedMemory) as unknown) as never,
  });
}
