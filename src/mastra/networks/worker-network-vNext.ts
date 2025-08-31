import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { Agent } from '@mastra/core/agent';
import { SystemContext } from '../utils/shared-context';
import { resolveModel, resolveModelWithOptions } from '../config/model-registry';
import { sharedMemory } from '../shared-memory';
import { createSearchWorkerAgent } from '../agents/network/workers/search-worker-agent';
import { createCodeWorkerAgent } from '../agents/network/workers/code-worker-agent';
import { createWorkerAgent } from '../agents/network/worker-agent';

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
- code: 成果物の作成/編集（HTML/Markdown/コード）。ツール: artifact-io, artifact-diff, content-store
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

