import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { SystemContext } from '../utils/shared-context';
import { createSearchWorkerAgent } from '../agents/network/workers/search-worker-agent';
import { createCodeWorkerAgent } from '../agents/network/workers/code-worker-agent';
import { createWorkerAgent } from '../agents/network/worker-agent';

export type WorkerKind = 'search' | 'code' | 'general';

export interface WorkerNetworkOptions {
  modelKey?: string;
  systemContext?: SystemContext;
  modelOptions?: Record<string, unknown>;
  memory?: unknown;
}

export interface WorkerSelectionHints {
  taskType?: string;
  description?: string;
}

export interface GenerateOptions {
  memory?: { thread: string; resource: string };
  runtimeContext?: unknown;
  [key: string]: unknown;
}

export function createWorkerNetwork(opts: WorkerNetworkOptions = {}) {
  const modelKey = opts.modelKey ?? 'claude-sonnet-4';
  const memory = opts.memory ?? sharedMemory;

  // Construct worker pool
  const workers: Record<WorkerKind, Agent> = {
    search: createSearchWorkerAgent(modelKey, opts.systemContext, opts.modelOptions, memory),
    code: createCodeWorkerAgent(modelKey, opts.systemContext, opts.modelOptions, memory),
    general: createWorkerAgent(modelKey, opts.systemContext), // already uses sharedMemory internally
  };

  function selectWorker(hints: WorkerSelectionHints, prompt?: string): { kind: WorkerKind; agent: Agent; reason: string } {
    const t = (hints.taskType || '').toLowerCase();
    const d = (hints.description || '').toLowerCase();
    const p = (prompt || '').toLowerCase();

    const isSearch =
      /web|search|research|investigate|調査|検索/.test(t) ||
      /web|search|research|link|url|調査|検索|参照/.test(d + ' ' + p);

    const isCode =
      /code|implement|refactor|fix|artifact|slide|html|markdown|generate/.test(t) ||
      /コード|実装|修正|差分|アーティファクト|HTML|Markdown|生成/.test(d + ' ' + p);

    if (isCode && !isSearch) return { kind: 'code', agent: workers.code, reason: 'code-task' };
    if (isSearch && !isCode) return { kind: 'search', agent: workers.search, reason: 'search-task' };
    // Ties → prefer code for tangible output tasks
    if (isCode && isSearch) return { kind: 'code', agent: workers.code, reason: 'mixed-prefers-code' };
    return { kind: 'general', agent: workers.general, reason: 'fallback' };
  }

  async function generateForTask(
    hints: WorkerSelectionHints,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: GenerateOptions,
  ): Promise<{ text: string; chosen: WorkerKind; reason: string }> {
    const prompt = messages.map(m => m.content).join('\n');
    const { kind, agent, reason } = selectWorker(hints, prompt);
    try {
      const { text } = await agent.generate(messages, options as Record<string, unknown>);
      return { text, chosen: kind, reason };
    } catch (err) {
      const msg = (err as Error)?.message || '';
      const needsDict = /tool_use\.input: Input should be a valid dictionary/i.test(msg);
      if (!needsDict) throw err;

      // Retry once with explicit system guidance for tool input structure.
      const systemGuard = {
        role: 'system' as const,
        content:
          'Tool usage guard: When calling any tool, always pass a JSON object (dictionary). ' +
          'Examples: exa-mcp-search => {"query":"文字列","numResults":5}; docs-reader => {"path":"docs/..."}. ' +
          'Do NOT pass a raw string or array as tool input. If unsure, avoid tool calls and answer in text.'
      };
      const retryMessages = [systemGuard, ...messages];
      const { text } = await agent.generate(retryMessages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, options as Record<string, unknown>);
      return { text, chosen: kind, reason: reason + ':retry-guard' };
    }
  }

  return {
    workers,
    selectWorker,
    generateForTask,
  };
}
