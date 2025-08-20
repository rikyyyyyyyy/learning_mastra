import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { resolveModel, AnyModel } from '../config/model-registry';
import { getToolsForRole } from '../config/tool-registry';
import { SystemContext } from '../utils/shared-context';

export type RoleId = 'GENERAL' | 'CEO' | 'MANAGER' | 'WORKER';

export interface AgentFactoryOptions {
  role: RoleId;
  modelKey?: string;
  memory?: unknown; // NewAgentNetworkがDynamicArgumentを要求する環境もあるためunknownで受ける
  systemContext?: SystemContext; // システムコンテキストをオプションで追加
}

export function createRoleAgent(options: AgentFactoryOptions): Agent {
  const { role, modelKey, memory, systemContext } = options;
  const { aiModel, info } = resolveModel(modelKey);

  const nameMap: Record<RoleId, string> = {
    GENERAL: 'General AI Assistant',
    CEO: 'CEO Agent - Strategic Task Director',
    MANAGER: 'Manager Agent - Task Planner & Coordinator',
    WORKER: 'Worker Agent - Task Executor',
  };

  const agent = new Agent({
    name: nameMap[role],
    instructions: getAgentPrompt(role, systemContext),
    model: aiModel as AnyModel,
    tools: getToolsForRole(role) as unknown as never,
    memory: memory ?? sharedMemory,
  });

  // デバッグ用モデル情報を付与（既存運用の互換）
  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = info;

  return agent;
}

export interface AgentDefinitionInput {
  id: string;
  name: string;
  role: RoleId;
  modelKey?: string;
  promptText?: string;
  tools?: string[]; // toolRegistry のキー
  memory?: unknown;
  systemContext?: SystemContext; // システムコンテキストをオプションで追加
}

export function createAgentFromDefinition(def: AgentDefinitionInput): Agent {
  const { aiModel, info } = resolveModel(def.modelKey);

  const instructions = def.promptText ?? getAgentPrompt(def.role, def.systemContext);

  // ツール解決（指定があればそのセット、無ければ役割デフォルト）
  const defaultTools = getToolsForRole(def.role);
  let tools: Record<string, unknown> = defaultTools;
  if (def.tools && def.tools.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = require('../config/tool-registry') as any;
    const selected: Record<string, unknown> = {};
    def.tools.forEach((key) => {
      if (registry.toolRegistry && registry.toolRegistry[key]) {
        selected[key] = registry.toolRegistry[key];
      }
    });
    tools = selected;
  }

  const agent = new Agent({
    name: def.name,
    instructions,
    model: aiModel as AnyModel,
    tools: tools as unknown as never,
    memory: def.memory ?? sharedMemory,
  });

  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = info;
  return agent;
}

