import { getDAOs } from '../task-management/db/dao';
import { createAgentFromDefinition } from '../agents/factory';
import { ensureTaskDBInitialized } from '../task-management/db/init';
import { buildNetwork } from './builder';
import { resolveModel } from '../config/model-registry';

export async function resolveNetworkFromDB(options: {
  networkId?: string; // 指定が無ければ enabled の最新を取得
  memory?: unknown;
  modelOptions?: Record<string, unknown>;
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
  const { resolveModelWithOptions } = await import('../config/model-registry');
  const { aiModel, info } = options.modelOptions
    ? resolveModelWithOptions(primaryModelKey, options.modelOptions)
    : resolveModel(primaryModelKey);

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
    }, options.modelOptions);
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

CEO-Manager-Worker が厳密なルーティング契約に従って協働します。
ルーティングはToolのエラーコードによって強制され、誤順序時は自動で適切な役割に戻ります。

【Routing Contract（重要）】
- stage: initialized → policy_set → planning → executing → finalizing → completed
- エラーコード:
  - POLICY_NOT_SET → CEOによるsave_policy
  - INVALID_STAGE → stageに適合する操作のみ実施
  - TASK_NOT_FOUND/TASK_NOT_QUEUED → 小タスク定義・状態の修正
  - RESULT_PARTIAL_CONTINUE_REQUIRED → 同一Workerが継続生成
  - SUBTASKS_INCOMPLETE → 最終保存を行わず完了待機

【指示】
- 全ツール入力はJSON辞書のみ。エラーは再試行せずエージェントを切り替えること。
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
