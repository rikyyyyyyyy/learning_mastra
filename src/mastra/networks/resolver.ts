import { getDAOs } from '../task-management/db/dao';
import { createAgentFromDefinition } from '../agents/factory';
import { ensureTaskDBInitialized } from '../task-management/db/init';
import { buildNetwork } from './builder';
import { resolveModel } from '../config/model-registry';

export async function resolveNetworkFromDB(options: {
  networkId?: string; // 指定が無ければ enabled の最新を取得
  memory?: unknown;
}): Promise<{
  network: ReturnType<typeof buildNetwork>;
  agentMap: Record<string, ReturnType<typeof createAgentFromDefinition>>;
  modelInfo: { provider: string; modelId: string; displayName: string };
}> {
  await ensureTaskDBInitialized();
  const { networkDefinitions, agentDefinitions } = getDAOs();
  const net = options.networkId ? await networkDefinitions.findById(options.networkId) : await networkDefinitions.findFirstEnabled();
  if (!net) throw new Error('No enabled network definition found');

  // エージェント定義の取得
  const allAgents = await agentDefinitions.findAll();
  const selected = allAgents.filter((a) => net.agent_ids.includes(a.id) && a.enabled);
  if (selected.length === 0) throw new Error('No enabled agents found for the network');

  // ネットワークモデルは、デフォルト：最初のエージェントの model_key（無ければ既定）
  const primaryModelKey = selected[0].model_key;
  const { aiModel, info } = resolveModel(primaryModelKey);

  // エージェント生成
  const agentMap: Record<string, ReturnType<typeof createAgentFromDefinition>> = {};
  for (const agentDef of selected) {
    const agent = createAgentFromDefinition({
      id: agentDef.id,
      name: agentDef.name,
      role: agentDef.role,
      modelKey: agentDef.model_key,
      promptText: agentDef.prompt_text,
      tools: agentDef.tools,
      memory: options.memory,
    });
    agentMap[agentDef.id] = agent as any;
  }

  // defaultAgentId はネットワーク定義のフィールドを優先
  const defaultAgentId = net.default_agent_id;
  if (!agentMap[defaultAgentId]) {
    throw new Error(`Default agent '${defaultAgentId}' is not present/enabled in this network`);
  }

  // instructions は現状維持（DBで持たず、今の固定テンプレを使う）
  const instructions = `
## エージェントネットワーク実行フロー

このネットワークは複数エージェントが並列的な役割分担で協働します。
ルーティングは各エージェントの役割と追加指令に基づいて決まります。
`;

  const network = buildNetwork({
    id: net.id,
    name: net.name,
    instructions,
    model: aiModel,
    agents: agentMap as any,
    defaultAgentId,
    memory: options.memory,
  });

  return { network, agentMap, modelInfo: info };
}

