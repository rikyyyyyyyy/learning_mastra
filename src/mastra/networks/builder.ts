import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { Agent } from '@mastra/core/agent';

export interface NetworkBuildParams {
  id: string;
  name: string;
  instructions: string; // 既存の長文プロンプトをそのまま渡す
  model: unknown;
  agents: Record<string, Agent>; // id -> Agent（例: ceo/manager/worker）
  defaultAgentId: string; // 例: 'manager'
  memory?: unknown; // DynamicArgument に適合させる可能性があるため unknown
}

export function buildNetwork(params: NetworkBuildParams): NewAgentNetwork {
  const { id, name, instructions, model, agents, defaultAgentId, memory } = params;

  const defaultAgent = agents[defaultAgentId];
  if (!defaultAgent) {
    throw new Error(`Default agent '${defaultAgentId}' not found in agents map`);
  }

  return new NewAgentNetwork({
    id,
    name,
    instructions,
    model,
    agents,
    defaultAgent,
    memory: memory
      ? ((() => memory) as unknown as never)
      : undefined,
  });
}

