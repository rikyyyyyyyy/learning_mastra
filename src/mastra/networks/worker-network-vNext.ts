import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { Agent } from '@mastra/core/agent';
import { SystemContext } from '../utils/shared-context';
import { resolveModel, resolveModelWithOptions } from '../config/model-registry';
import { sharedMemory } from '../shared-memory';
import { createSearchWorkerAgent } from '../agents/network/workers/search-worker-agent';
import { createCodeWorkerAgent } from '../agents/network/workers/code-worker-agent';
import { createWorkerAgent } from '../agents/network/worker-agent';
import { createWorkerFromDefinition, WorkerMetadata } from '../agents/worker-factory';

export interface WorkerPoolOptions {
  id: string;
  name?: string;
  modelKey?: string;
  systemContext?: SystemContext;
  modelOptions?: Record<string, unknown>;
  memory?: unknown;
}

export function buildWorkerPoolNetwork(opts: WorkerPoolOptions): NewAgentNetwork {
  const { id, name, modelKey = 'claude-sonnet-4', systemContext, modelOptions, memory } = opts;
  const { aiModel } = modelOptions
    ? resolveModelWithOptions(modelKey, modelOptions)
    : resolveModel(modelKey);

  // フォールバック（DB未連携時）
  const agents: Record<string, Agent> = {
    search: createSearchWorkerAgent(modelKey, systemContext, modelOptions, memory),
    code: createCodeWorkerAgent(modelKey, systemContext, modelOptions, memory),
    general: createWorkerAgent(modelKey, systemContext),
  } as const;

  return new NewAgentNetwork({
    id,
    name: name || 'Worker Pool Network',
    instructions: `
あなたは小タスクを実行するエージェントネットワークです。以下のエージェントから最適な担当を選んで実行してください。

- search: Web/論文/リファレンスの検索・要約。ツール: exa-mcp-search, docs-reader
- code: 成果物の作成/編集（HTML/Markdown/コード）。ツール: subtask-artifact（ensure/commit/diff/edits/finalize）, task-management
- general: 上記に当てはまらない汎用作業

【ルーティング規則（厳守）】
- 入力に "web" / "search" / "調査" / "ニュース" 等があれば search を優先
- 入力に "code" / "artifact" / "HTML" / "スライド" 等があれば code を優先
- 両方該当なら code を優先、それ以外は general

【ツール入力の重要ルール】
すべてのツール入力は必ず JSON オブジェクト（辞書）で与える（例: exa-mcp-search => {"query":"...","numResults":5}）。
文字列単体や配列を直接渡してはならない。
`,
    model: ((() => aiModel) as unknown) as never,
    agents,
    defaultAgent: agents.general,
    memory: ((() => (memory ?? sharedMemory)) as unknown) as never,
  });
}

// DBからWORKER定義を読み込み、ネットワークを構成する非同期ビルダー
export async function buildWorkerPoolNetworkFromDB(opts: WorkerPoolOptions & { modelOptions?: Record<string, unknown> }): Promise<NewAgentNetwork> {
  const { id, name, modelKey = 'claude-sonnet-4', systemContext, modelOptions, memory } = opts;
  const { aiModel } = modelOptions
    ? resolveModelWithOptions(modelKey, modelOptions)
    : resolveModel(modelKey);

  let agentMap: Record<string, Agent> = {};
  try {
    // DBが初期化済みである前提（ワークフロー前段のステップで初期化済み）
    const { getDAOs } = await import('../task-management/db/dao');
    const { agentDefinitions } = getDAOs();
    const all = await agentDefinitions.findAll();
    const workers = all.filter(a => a.role === 'WORKER' && a.enabled);
    if (workers.length > 0) {
      workers.forEach((w, idx) => {
        const agent = createWorkerFromDefinition({ id: w.id, name: w.name, model_key: w.model_key, prompt_text: w.prompt_text, metadata: w.metadata as unknown as WorkerMetadata }, modelOptions);
        agentMap[w.id || `worker-${idx+1}`] = agent;
      });
    }
  } catch {
    // 失敗時はフォールバック（静的）
  }

  if (Object.keys(agentMap).length === 0) {
    agentMap = {
      default: createWorkerAgent(modelKey, systemContext),
    } as const;
  }

  return new NewAgentNetwork({
    id,
    name: name || 'Worker Pool Network',
    instructions: `
あなたは小タスクを実行するエージェントネットワークです。登録されたワーカーから自動的に最適な担当を選択して実行してください。

【ツール入力の重要ルール】
すべてのツール入力は必ず JSON オブジェクト（辞書）で与える（例: exa-mcp-search => {"query":"...","numResults":5}）。
文字列単体や配列を直接渡してはならない。
`,
    model: ((() => aiModel) as unknown) as never,
    agents: agentMap,
    defaultAgent: agentMap[Object.keys(agentMap)[0]],
    memory: ((() => (memory ?? sharedMemory)) as unknown) as never,
  });
}

export async function generateWithWorkerNetwork(
  net: NewAgentNetwork,
  userText: string,
  options?: { thread?: string; resource?: string; runtimeContext?: unknown }
): Promise<string> {
  // Prefer loopStream when available to let the network route actively.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyNet = net as any;
  const execOpts = {
    threadId: options?.thread,
    resourceId: options?.resource,
    runtimeContext: options?.runtimeContext,
  };

  if (typeof anyNet.loopStream === 'function') {
    const result = await anyNet.loopStream(userText, execOpts);
    if (result?.stream) {
      let final = '';
      for await (const chunk of result.stream as AsyncIterable<{ type: string; data?: { text?: string } }>) {
        if ((chunk as { type: string }).type === 'text-delta') {
          const t = (chunk as { data?: { text?: string } }).data?.text || '';
          final += t;
        }
      }
      // フォールバック: streamのfinalTextがあればそれを優先
      if (typeof result.finalText === 'string' && result.finalText.length > 0) return result.finalText;
      return final;
    }
  }

  if (typeof anyNet.generate === 'function') {
    const { text } = await anyNet.generate([
      { role: 'user', content: userText },
    ], { memory: { thread: options?.thread, resource: options?.resource }, runtimeContext: options?.runtimeContext });
    return text as string;
  }

  // 最後のフォールバック（ネットワークAPIが利用不可の場合）: デフォルトエージェントで実行
  const defAgent: Agent = (anyNet.defaultAgent as Agent) || (anyNet.agents?.general as Agent);
  const { text } = await defAgent.generate([
    { role: 'user', content: userText },
  ], { memory: { thread: options?.thread, resource: options?.resource }, runtimeContext: options?.runtimeContext });
  return text as string;
}
