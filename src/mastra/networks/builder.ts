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
    instructions: `
${instructions}

【Routing Contract（重要）】
- stageの順序: initialized → policy_set → planning → executing → finalizing → completed
- 主要エラーコードと行動:
  - POLICY_NOT_SET: CEOがsave_policyを実行するまで待機
  - INVALID_STAGE: 現在stageで許可された操作のみ行う
  - TASK_NOT_FOUND / TASK_NOT_QUEUED: 小タスクの存在/状態を見直す
  - RESULT_PARTIAL_CONTINUE_REQUIRED: 同一Workerが継続生成するまで完了処理を行わない
  - SUBTASKS_INCOMPLETE: 最終保存せず、未完了タスクの完了を待つ

【一般ルール】
- 全ツールはJSONオブジェクト入力のみ
- ツールがエラーを返したら再試行せず、エラーコードに従って正しい役割へルーティング
`,
    model: ((() => model) as unknown) as never,
    agents,
    defaultAgent,
    memory: memory ? (((() => memory) as unknown) as never) : undefined,
  });
}
