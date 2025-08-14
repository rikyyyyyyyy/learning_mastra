import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { Agent } from '@mastra/core/agent';
import { resolveModel } from '../config/model-registry';
import { createRoleAgent } from '../agents/factory';
import { buildNetwork } from '../networks/builder';
import { sharedMemory } from '../shared-memory';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { taskViewerTool } from '../task-management/tools/task-viewer-tool';
import { finalResultTool } from '../task-management/tools/final-result-tool';
import { policyManagementTool, policyCheckTool } from '../task-management/tools/policy-management-tool';
import { taskManagementTool } from '../task-management/tools/task-management-tool';
import { batchTaskCreationTool } from '../task-management/tools/batch-task-creation-tool';
import { directiveManagementTool } from '../task-management/tools/directive-management-tool';
import { exaMCPSearchTool } from '../tools/exa-search-wrapper';
import { docsReaderTool } from './docs-reader-tool';
import { agentLogStore, formatAgentMessage } from '../utils/agent-log-store';
import { createAgentLogger } from '../utils/agent-logger';

// ===== Typed stream event definitions and helpers =====
type AgentRoutingChunk = {
  type: 'agent-routing';
  data?: { fromAgent?: string; toAgent?: string; reason?: string };
};

type ToolCallStartChunk = {
  type: 'tool-call-streaming-start';
  name?: string;
  toolName?: string;
  args?: { resourceId?: string };
};

type ToolCallDeltaChunk = {
  type: 'tool-call-delta';
  argsTextDelta?: string;
  args?: { resourceId?: string };
};

type ToolCallFinishChunk = {
  type: 'tool-call-streaming-finish';
  toolName?: string;
};

type ToolResultChunk = {
  type: 'tool-result';
  name?: string;
  toolName?: string;
  result?: unknown;
};

type TextDeltaChunk = {
  type: 'text-delta';
  text?: string;
  textDelta?: string;
};

type ToolCallChunk = {
  type: 'tool-call';
  name?: string;
  toolName?: string;
};

type AgentMessageChunk = {
  type: 'agent-message' | 'message';
  data?: { agentId?: string; name?: string; content?: string; text?: string };
  content?: string; // some variants may put content at root
  name?: string;
};

type StepResultChunk = {
  type: 'step-result';
  stepId?: string;
  payload?: { output?: { resourceId?: string } };
};

type StepFinishChunk = {
  type: 'step-finish';
  stepId?: string;
  payload?: unknown;
};

type FinishChunk = {
  type: 'finish';
  data?: unknown;
  result?: unknown;
};

type WorkflowStreamChunk =
  | AgentRoutingChunk
  | ToolCallStartChunk
  | ToolCallDeltaChunk
  | ToolCallFinishChunk
  | ToolResultChunk
  | TextDeltaChunk
  | ToolCallChunk
  | AgentMessageChunk
  | StepResultChunk
  | StepFinishChunk
  | FinishChunk
  | { type: string; [key: string]: unknown };

// Reserved for future use when tool name extraction needs unification
// function getToolNameFromChunk(chunk: Partial<ToolCallStartChunk | ToolCallFinishChunk | ToolResultChunk | ToolCallChunk>): string | undefined {
//   return (chunk as Partial<ToolResultChunk>).toolName ?? (chunk as Partial<ToolCallStartChunk | ToolCallChunk>).name;
// }

function inferAgentFromString(raw?: string): { id: 'ceo' | 'manager' | 'worker'; name: 'CEO Agent' | 'Manager Agent' | 'Worker Agent' } | null {
  const s = (raw || '').toLowerCase();
  if (s.includes('ceo')) return { id: 'ceo', name: 'CEO Agent' };
  if (s.includes('manager')) return { id: 'manager', name: 'Manager Agent' };
  if (s.includes('worker')) return { id: 'worker', name: 'Worker Agent' };
  return null;
}

function inferAgentFromChunk(chunk: WorkflowStreamChunk): { id: string; name: string } | null {
  // ルーティングのメタデータ化: 明示的な agentId を優先
  if ('data' in chunk && (chunk as Partial<AgentMessageChunk>).data) {
    const d = (chunk as Partial<AgentMessageChunk>).data as { agentId?: string; name?: string };
    if (d?.agentId) {
      const id = d.agentId.toLowerCase();
      const name = d.name || d.agentId;
      return { id, name } as { id: string; name: string };
    }
  }
  if ('result' in chunk) {
    const r = (chunk as Partial<ToolResultChunk>).result as { resourceId?: string } | undefined;
    if (r?.resourceId) {
      const id = r.resourceId.toLowerCase();
      return { id, name: r.resourceId } as { id: string; name: string };
    }
  }
  if ('args' in chunk && (chunk as Partial<ToolCallStartChunk | ToolCallDeltaChunk>).args?.resourceId) {
    const id = (chunk as Partial<ToolCallStartChunk | ToolCallDeltaChunk>).args?.resourceId?.toLowerCase();
    if (id) return { id, name: id } as { id: string; name: string };
  }
  // 最小限のフォールバック
  if ('name' in chunk && (chunk as Partial<ToolCallStartChunk | ToolCallChunk>).name) {
    const id = (chunk as Partial<ToolCallStartChunk | ToolCallChunk>).name!.toLowerCase();
    return { id, name: (chunk as Partial<ToolCallStartChunk | ToolCallChunk>).name as string };
  }
  if ('toolName' in chunk && (chunk as Partial<ToolResultChunk | ToolCallFinishChunk>).toolName) {
    const id = (chunk as Partial<ToolResultChunk | ToolCallFinishChunk>).toolName!.toLowerCase();
    return { id, name: (chunk as Partial<ToolResultChunk | ToolCallFinishChunk>).toolName as string };
  }
  return null;
}

// バックグラウンドでエージェントネットワークを実行
const executeAgentNetwork = async (
  mastraInstance: unknown,
  jobId: string,
  inputData: {
    jobId: string;
    taskType: string;
    taskDescription: string;
    taskParameters: unknown;
    context?: {
      priority?: 'low' | 'medium' | 'high';
      constraints?: unknown;
      expectedOutput?: string;
      additionalInstructions?: string;
    };
  },
  runtimeContext?: unknown
) => {
  const startTime = Date.now();
  
  try {
    const logger = createAgentLogger('AgentNetwork');
    logger.info(`エージェントネットワーク実行開始 jobId=${jobId} taskType=${inputData.taskType} ts=${new Date().toISOString()}`);

    // タスク管理システムにタスクを登録
    try {
      const { getDAOs } = await import('../task-management/db/dao');
      const daos = getDAOs();
      
      // 現在のエージェント名を取得（runtimeContextから）
      const createdBy = (runtimeContext as { get: (key: string) => unknown })?.get?.('agentName') as string || 'general-agent';
      
      await daos.tasks.create({
        task_id: jobId,
        network_id: jobId, // Use jobId as network_id
        parent_job_id: inputData.jobId,
        network_type: 'CEO-Manager-Worker',
        status: 'queued',
        task_type: inputData.taskType,
        task_description: inputData.taskDescription,
        task_parameters: inputData.taskParameters,
        progress: 0,
        created_by: createdBy,
        priority: inputData.context?.priority || 'medium',
        step_number: undefined, // Explicitly set to undefined to mark as main network task
        metadata: {
          isNetworkMainTask: true, // Mark this as the main network task
          expectedOutput: inputData.context?.expectedOutput,
          constraints: inputData.context?.constraints,
          additionalInstructions: inputData.context?.additionalInstructions,
        },
      });
      
      logger.debug(`タスクをタスク管理DBに登録 jobId=${jobId}`);
    } catch (dbError) {
      console.warn('⚠️ タスク管理DBへの登録に失敗（処理は継続）:', dbError);
    }

    // Mastraインスタンスが利用可能か確認
    const mastraTyped = mastraInstance as { 
      getAgent: (id: string) => Agent | undefined;
      getMemory: () => unknown;
    };
    if (!mastraTyped) {
      throw new Error('Mastraインスタンスが利用できません');
    }

    // ジョブステータスを実行中に更新
    updateJobStatus(jobId, 'running');
    
    // タスク管理DBのステータスも更新
    try {
      const { getDAOs } = await import('../task-management/db/dao');
      const daos = getDAOs();
      await daos.tasks.updateStatus(jobId, 'running');
    } catch (dbError) {
      console.warn('⚠️ タスクステータスの更新に失敗:', dbError);
    }

    // 選択されたモデルをruntimeContextから取得し、対応するLanguageModelを解決
    const selectedModelType = (runtimeContext as { get: (key: string) => unknown })?.get?.('selectedModel') as string | undefined;
    const { aiModel: networkModel, info: networkModelInfo } = resolveModel(selectedModelType);
    logger.info(`エージェントネットワーク用モデル model=${networkModelInfo.displayName} provider=${networkModelInfo.provider}`);

    // 選択モデルで各ロールのエージェントを動的生成（ファクトリ経由）
    const ceoAgent = createRoleAgent({ role: 'CEO', modelKey: selectedModelType, memory: sharedMemory });
    const managerAgent = createRoleAgent({ role: 'MANAGER', modelKey: selectedModelType, memory: sharedMemory });
    const workerAgent = createRoleAgent({ role: 'WORKER', modelKey: selectedModelType, memory: sharedMemory });

    // メモリ設定を準備
    const resourceId = (runtimeContext as { get: (key: string) => unknown })?.get?.('resourceId') as string | undefined;
    const threadId = (runtimeContext as { get: (key: string) => unknown })?.get?.('threadId') as string | undefined;
    const memoryConfig = resourceId && threadId ? {
      resource: resourceId,
      thread: threadId,
    } : undefined;

    // メモリを取得
    const memory = memoryConfig ? mastraTyped?.getMemory() : undefined;
    
    // エージェントネットワークを作成
    const agentNetwork = buildNetwork({
      id: 'task-execution-network',
      name: 'Task Execution Network',
      instructions: `
## エージェントネットワーク実行フロー

このネットワークはCEO-Manager-Workerの3つのエージェントが並列的な役割分担で協働します。
3者は上下関係ではなく、それぞれが専門的な役割を持つ並列的な関係です。

### 全体の流れ：

1. **開始時（Managerがデフォルト）**
   - Managerがタスクを受信
   - 方針が未決定の場合、CEOに方針決定を要請

2. **CEO方針決定**
   - 方針が未決定の場合：全体方針を決定・提示
   - 追加指令が報告された場合：方針を修正
   - 全タスク完了が報告された場合：最終成果物を生成・保存
   - 上記以外の場合は応答しない

3. **Manager タスク管理**
   - CEO方針に基づきタスクを実行可能な小タスクに分解
   - batchTaskCreationToolでタスクリストをDBに保存
   - 頻繁に追加指令DBを確認（directiveManagementTool）
   - Workerに個別タスクを順番に指示
   - 各タスクの結果をツールでDBに格納

4. **Worker 段階的実行**
   - Managerが作成したタスクリストに従って実行
   - 一つのタスクが終わったら必ずManagerに報告
   - Managerが結果を保存するまで待機
   - 次のタスクの指示を受けて継続

5. **結果管理と完了**
   - Managerが各タスクの結果をDBに格納
   - 全タスク完了後、Managerが「全タスク完了」をCEOに報告
   - CEOがtaskViewerToolで小タスクの結果を閲覧
   - CEOが小タスクの結果を統合して最終成果物を生成
   - CEOがfinalResultToolで最終成果物を保存（General Agentが取得可能）

### ルーティングルール：
- Manager → CEO：方針が未決定の場合、追加指令がある場合、全タスク完了時
- CEO → Manager：方針決定後・更新後は必ずManagerに委譲
- Manager → Worker：個別タスク実行が必要な場合
- Worker → Manager：タスク完了時は必ずManagerに報告
- CEO → Network完了：最終成果物保存後（finalResultTool実行後）

### 重要なポイント：
- 各エージェントは並列的な役割分担（上下関係なし）
- Workerは必ず一つのタスクごとにManagerに報告
- Managerは頻繁に追加指令を確認
- 追加指令があればCEOが方針を修正
`,
      model: networkModel,
      agents: {
        ceo: ceoAgent as Agent,
        manager: managerAgent as Agent,
        worker: workerAgent as Agent,
      },
      defaultAgentId: 'manager',
      memory,
    });

    // タスクコンテキストを準備
    let parsedParameters = inputData.taskParameters;
    if (typeof inputData.taskParameters === 'string') {
      try {
        parsedParameters = JSON.parse(inputData.taskParameters);
      } catch (e) {
        console.warn('taskParametersのパースに失敗しました:', e);
      }
    }

    const networkPrompt = `
Execute the following task:
Network ID: ${jobId}
Type: ${inputData.taskType}
Description: ${inputData.taskDescription}
Parameters: ${JSON.stringify(parsedParameters, null, 2)}
${inputData.context?.expectedOutput ? `Expected Output: ${inputData.context.expectedOutput}` : ''}
${inputData.context?.constraints ? `Constraints: ${JSON.stringify(inputData.context.constraints)}` : ''}
${inputData.context?.additionalInstructions ? `Additional Instructions: ${inputData.context.additionalInstructions}` : ''}

Priority: ${inputData.context?.priority || 'medium'}

IMPORTANT: When creating tasks in the database, use the Network ID "${jobId}" for all tasks in this network.

As the CEO agent, analyze this task and provide strategic direction. The agent network will automatically route your guidance to the appropriate agents for planning and execution.
`;

    logger.debug(`ネットワークプロンプト preview=${networkPrompt.substring(0, 400)}`);

    // ログストアのジョブを作成
    const jobLog = agentLogStore.getJobLog(jobId);
    if (!jobLog) {
      agentLogStore.createJob(jobId, inputData.taskType);
    }

    // jobIdをコンテキストに追加
    if (runtimeContext && jobId) {
      (runtimeContext as { set: (key: string, value: unknown) => void }).set('currentJobId', jobId);
      (runtimeContext as { set: (key: string, value: unknown) => void }).set('taskType', inputData.taskType);
    }

    // カスタムオプションでエージェントネットワークのloopメソッドを実行
    const networkOptions = {
      maxIterations: 10,
      debug: process.env.AGENT_NETWORK_DEBUG === 'true',
      stream: true,
    };
    
    logger.debug(`エージェントネットワーク実行オプション maxIterations=${networkOptions.maxIterations} debug=${networkOptions.debug} stream=${networkOptions.stream}`);
    
    // CEOが最終成果物を管理するため result は不要
    const conversationHistory: import('../utils/agent-log-store').AgentConversationEntry[] = [];
    let iterationCounter = 1;
    
    // エージェントネットワークを実行
    logger.info(`NewAgentNetwork実行開始 jobId=${jobId}`);
    
    // loopStreamメソッドが存在する場合はそれを使用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (agentNetwork as any).loopStream === 'function') {
      console.log('🌊 loopStreamメソッドを使用してストリーミング実行');
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamResult = await (agentNetwork as any).loopStream(
        networkPrompt,
        {
          ...networkOptions,
          threadId: memoryConfig?.thread,
          resourceId: memoryConfig?.resource,
          runtimeContext
        }
      );
      
      // ストリームの処理
      if (streamResult && streamResult.stream) {
        logger.debug('ストリームオブジェクトを取得');
        
        const agentOutputs = new Map<string, { 
          id: string, 
          name: string, 
          content: string,
          lastSentLength: number,
          entryId?: string,
          isSent: boolean,
          iteration: number
        }>();
        // ジョブスコープでツール名を保持（グローバル状態は使用しない）
        const toolNameByAgent = new Map<string, string>();
        let currentStreamingAgent: { id: string, name: string } | null = null;
        let lastActiveAgent: string | null = null;
        const processedMessageIds = new Set<string>();
        
        // ストリームからイベントを処理
        for await (const rawChunk of streamResult.stream) {
          const chunk = rawChunk as WorkflowStreamChunk;
          
          // エージェントルーティングイベント
          if (chunk.type === 'agent-routing') {
            const routingInfo = (chunk as AgentRoutingChunk).data ?? {};
            logger.debug(`エージェントルーティング from=${String(routingInfo.fromAgent || '')} to=${String(routingInfo.toAgent || '')} reason=${routingInfo.reason || 'N/A'}`);
            
            const routingEntry = formatAgentMessage(
              'system',
              'Network Router',
              `ルーティング: ${String(routingInfo.fromAgent || '')} → ${String(routingInfo.toAgent || '')}\n理由: ${routingInfo.reason || 'N/A'}`,
              iterationCounter,
              'internal'
            );
            agentLogStore.addLogEntry(jobId, routingEntry);

            // ルーティング先をアクティブエージェントとして設定（text-deltaのみのケースに備える）
            try {
              let agentId = 'unknown';
              let agentName = 'Unknown Agent';
              const to = String(routingInfo.toAgent || '').toLowerCase();
              if (to.includes('ceo')) { agentId = 'ceo'; agentName = 'CEO Agent'; }
              else if (to.includes('manager')) { agentId = 'manager'; agentName = 'Manager Agent'; }
              else if (to.includes('worker')) { agentId = 'worker'; agentName = 'Worker Agent'; }

              if (agentId !== 'unknown') {
                if (lastActiveAgent && lastActiveAgent !== agentId) {
                  iterationCounter++;
                }
                lastActiveAgent = agentId;

                currentStreamingAgent = { id: agentId, name: agentName };
                if (!agentOutputs.has(agentId)) {
                  agentOutputs.set(agentId, {
                    id: agentId,
                    name: agentName,
                    content: '',
                    lastSentLength: 0,
                    entryId: `${jobId}-${agentId}-${iterationCounter}-stream`,
                    isSent: false,
                    iteration: iterationCounter,
                  });
                  // 内部開始メッセージ（重複防止）
                  const startKey = `start-${agentId}-${iterationCounter}`;
                  if (!processedMessageIds.has(startKey)) {
                    const startEntry = formatAgentMessage(
                      agentId,
                      agentName,
                      `${agentName}が応答を開始しました...`,
                      iterationCounter,
                      'internal'
                    );
                    agentLogStore.addLogEntry(jobId, startEntry);
                    processedMessageIds.add(startKey);
                  }
                }
              }
            } catch (e) {
              console.warn('agent-routing handling failed:', e);
            }
          }
          
          // フォールバック: 非ストリーミング環境の一般的なツール呼び出しイベント
          if (chunk.type === 'tool-call') {
            let agentName = 'Unknown Agent';
            let agentId = 'unknown';
            
            const g = inferAgentFromChunk(chunk) as { id: 'ceo' | 'manager' | 'worker'; name: 'CEO Agent' | 'Manager Agent' | 'Worker Agent' } | null;
            if (g) { agentId = g.id; agentName = g.name; }
            else if ((chunk as ToolCallChunk).name) { agentName = (chunk as ToolCallChunk).name!; agentId = (chunk as ToolCallChunk).name!.toLowerCase().replace(/\s+/g, '-'); }
            
            if (lastActiveAgent && lastActiveAgent !== agentId) {
              iterationCounter++;
            }
            lastActiveAgent = agentId;
            
            currentStreamingAgent = { id: agentId, name: agentName };
            agentOutputs.set(agentId, {
              id: agentId,
              name: agentName,
              content: '',
              lastSentLength: 0,
              entryId: `${jobId}-${agentId}-${iterationCounter}-stream`,
              isSent: false,
              iteration: iterationCounter,
            });
            
            const startKey = `start-${agentId}-${iterationCounter}`;
            if (!processedMessageIds.has(startKey)) {
              const startEntry = formatAgentMessage(
                agentId,
                agentName,
                `${agentName}が応答を開始しました...`,
                iterationCounter,
                'internal'
              );
              agentLogStore.addLogEntry(jobId, startEntry);
              processedMessageIds.add(startKey);
            }
          }
          
          // ツール呼び出し開始
          if (chunk.type === 'tool-call-streaming-start') {
            let agentName = 'Unknown Agent';
            let agentId = 'unknown';
            
            const inferred = inferAgentFromChunk(chunk);
            if (inferred) { agentId = inferred.id; agentName = inferred.name; }
            else if ((chunk as ToolCallStartChunk).name) { agentName = (chunk as ToolCallStartChunk).name!; agentId = (chunk as ToolCallStartChunk).name!.toLowerCase().replace(/\s+/g, '-'); }
            
            if (lastActiveAgent && lastActiveAgent !== agentId) {
              iterationCounter++;
            }
            lastActiveAgent = agentId;
            
            currentStreamingAgent = { id: agentId, name: agentName };
            const startedToolName = (chunk as ToolCallStartChunk).toolName || (chunk as ToolCallStartChunk).name;
            agentOutputs.set(agentId, { 
              id: agentId, 
              name: agentName, 
              content: '',
              lastSentLength: 0,
              entryId: `${jobId}-${agentId}-${iterationCounter}-stream`,
              isSent: false,
              iteration: iterationCounter
            });
            // ツール名はジョブスコープのマップで保持
            if (startedToolName) toolNameByAgent.set(agentId, startedToolName);
            
            const startMessageKey = `start-${agentId}-${iterationCounter}`;
            if (!processedMessageIds.has(startMessageKey)) {
              const startEntry = formatAgentMessage(
                agentId,
                agentName,
                `${agentName}が応答を開始しました...`,
                iterationCounter,
                'internal'
              );
              agentLogStore.addLogEntry(jobId, startEntry);
              processedMessageIds.add(startMessageKey);
            }
          }
          
          // テキストデルタ（蓄積のみ。部分送信は行わない）
          if (chunk.type === 'tool-call-delta' && currentStreamingAgent && (chunk as ToolCallDeltaChunk).argsTextDelta) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput) {
              const argsDelta = (chunk as ToolCallDeltaChunk).argsTextDelta || '';
              agentOutput.content += argsDelta;
            }
          }
          // 追加: agentからの直接text-delta（蓄積のみ。部分送信は行わない）
          if (chunk.type === 'text-delta' && currentStreamingAgent && ((chunk as TextDeltaChunk).text || (chunk as TextDeltaChunk).textDelta)) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput) {
              const delta = (chunk as TextDeltaChunk).text || (chunk as TextDeltaChunk).textDelta || '';
              agentOutput.content += delta;
            }
          }
          
              // ツール呼び出し完了
          if (chunk.type === 'tool-call-streaming-finish' && currentStreamingAgent) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput && agentOutput.content && !agentOutput.isSent) {
              logger.debug(`エージェント応答完了 agent=${currentStreamingAgent.name} length=${agentOutput.content.length}`);
              
              const finalEntry = formatAgentMessage(
                currentStreamingAgent.id,
                currentStreamingAgent.name,
                agentOutput.content,
                agentOutput.iteration,
                'response'
              );
              // ツール名をバッジ表示用メタデータに付与（あれば）
              const toolName = (chunk as unknown as { toolName?: string }).toolName || toolNameByAgent.get(currentStreamingAgent.id);
              if (toolName) {
                finalEntry.metadata = {
                  ...(finalEntry.metadata || {}),
                  tools: [toolName],
                };
              }
              
              agentLogStore.addLogEntry(jobId, finalEntry);
              agentOutput.isSent = true;
              conversationHistory.push(finalEntry);
              agentOutputs.delete(currentStreamingAgent.id);
            }
            currentStreamingAgent = null;
          }
          
          // 完了イベント
          if (chunk.type === 'finish') {
            // result = chunk.data || chunk.result; // CEOが最終成果物を管理するため不要
            
            // 未送信の出力を送信
            for (const [agentId, agentOutput] of agentOutputs.entries()) {
              if (agentOutput.content && !agentOutput.isSent) {
                const finalEntry = formatAgentMessage(
                  agentId,
                  agentOutput.name,
                  agentOutput.content,
                  agentOutput.iteration,
                  'response'
                );
                agentLogStore.addLogEntry(jobId, finalEntry);
                conversationHistory.push(finalEntry);
              }
            }
          }

          // ステップ結果（agent-step）でのフォールバック送信
          if (chunk.type === 'step-result') {
            try {
              const output = (chunk as StepResultChunk).payload?.output as Record<string, unknown> | undefined;
              let agentId = 'unknown';
              let agentName = 'Unknown Agent';
              const inferred = inferAgentFromString(output?.resourceId as string | undefined);
              if (inferred) { agentId = inferred.id; agentName = inferred.name; }

              if (agentId !== 'unknown') {
                const agentOutput = agentOutputs.get(agentId);
                if (agentOutput && agentOutput.content && !agentOutput.isSent) {
                  const finalEntry = formatAgentMessage(
                    agentId,
                    agentName,
                    agentOutput.content,
                    agentOutput.iteration,
                    'response'
                  );
                  agentLogStore.addLogEntry(jobId, finalEntry);
                  conversationHistory.push(finalEntry);
                  agentOutputs.delete(agentId);
                  if (currentStreamingAgent?.id === agentId) {
                    currentStreamingAgent = null;
                  }
                }
              }
            } catch (e) {
              console.warn('step-result fallback failed:', e);
            }
          }

          // 汎用エージェントメッセージのフォールバック
          if (chunk.type === 'agent-message' || chunk.type === 'message') {
            try {
              const data = (chunk as AgentMessageChunk).data || chunk;
              const content = (data as { content?: string; text?: string })?.content || (data as { text?: string })?.text;
              if (content) {
                let agentId = 'system';
                let agentName = 'System';
                const inferred = inferAgentFromString((data as { agentId?: string; name?: string })?.agentId || (data as { name?: string })?.name);
                if (inferred) { agentId = inferred.id; agentName = inferred.name; }

                const entry = formatAgentMessage(
                  agentId,
                  agentName,
                  content,
                  iterationCounter,
                  'response'
                );
                agentLogStore.addLogEntry(jobId, entry);
                conversationHistory.push(entry);
              }
            } catch (e) {
              console.warn('agent-message fallback failed:', e);
            }
          }

          // フォールバック: ツール結果イベント
          if (chunk.type === 'tool-result' && (chunk as ToolResultChunk).result) {
            let agentId = currentStreamingAgent?.id || 'unknown';
            let agentName = currentStreamingAgent?.name || 'Unknown Agent';
            const g = inferAgentFromChunk(chunk) || inferAgentFromString(((chunk as ToolResultChunk).result as { resourceId?: string })?.resourceId);
            if (g) { agentId = g.id; agentName = g.name; }
            
            const agentOutput = currentStreamingAgent ? agentOutputs.get(currentStreamingAgent.id) : agentOutputs.get(agentId);
            if (agentOutput && agentOutput.content) {
              const finalEntry = formatAgentMessage(
                agentId,
                agentName,
                agentOutput.content,
                agentOutput.iteration,
                'response'
              );
              const toolName = (chunk as ToolResultChunk).toolName || toolNameByAgent.get(agentId);
              if (toolName) {
                finalEntry.metadata = {
                  ...(finalEntry.metadata || {}),
                  tools: [toolName],
                };
              }
              agentLogStore.addLogEntry(jobId, finalEntry);
              conversationHistory.push(finalEntry);
              agentOutputs.delete(agentId);
              currentStreamingAgent = null;
            } else {
              const resultText = typeof (chunk as ToolResultChunk).result === 'string' ? (chunk as ToolResultChunk).result as string : JSON.stringify((chunk as ToolResultChunk).result);
              const finalEntry = formatAgentMessage(
                agentId,
                agentName,
                resultText,
                iterationCounter,
                'response'
              );
              const toolName = (chunk as ToolResultChunk).toolName || toolNameByAgent.get(agentId);
              if (toolName) {
                finalEntry.metadata = {
                  ...(finalEntry.metadata || {}),
                  tools: [toolName],
                };
              }
              agentLogStore.addLogEntry(jobId, finalEntry);
              conversationHistory.push(finalEntry);
              currentStreamingAgent = null;
            }
          }
        }
        
        // ワークフロー状態を取得
        if (streamResult.getWorkflowState) {
          const state = await streamResult.getWorkflowState();
          if (state?.result) {
            // result = state.result; // CEOが最終成果物を管理するため不要
          }
        }
      }
    } else {
      // 通常のloopメソッドを使用
      logger.debug('通常のloopメソッドを使用');
      // result = await agentNetwork.loop(networkPrompt, networkOptions); // CEOが最終成果物を管理するため不要
      await agentNetwork.loop(networkPrompt, networkOptions);
    }
    
    logger.info('NewAgentNetwork実行完了');
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // 実行サマリーを作成
    const executionSummary = {
      totalIterations: conversationHistory.length || 3,
      agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
      executionTime: `${executionTime}s`,
    };
    
    // ログストアのジョブを完了としてマーク（暫定）。この後に最終成果物の存在チェックを行う
    agentLogStore.completeJob(jobId, executionSummary);
    
    // --- 最終成果物の存在チェック & ヘルスチェック ---
    try {
      const fs = await import('fs');
      const path = await import('path');
      const JOB_RESULTS_DIR = path.join(process.cwd(), '.job-results');
      const resultPath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);

      // ヘルスチェック: サブタスクが1件も作成されていない/保存されていない場合の検出
      let hasAnySubtasks = false;
      try {
        const { getDAOs } = await import('../task-management/db/dao');
        const daos = getDAOs();
        const tasks = await daos.tasks.findByNetworkId(jobId);
        const subTasks = tasks.filter(t => t.step_number !== null && t.step_number !== undefined);
        hasAnySubtasks = subTasks.length > 0;
        if (!hasAnySubtasks) {
          console.warn(`⚠️ サブタスクが作成/保存されていません。networkId=${jobId}`);
        }
      } catch (e) {
        console.warn('⚠️ ヘルスチェック中にエラーが発生しました（継続）:', e);
      }

      const resultExists = fs.existsSync(resultPath);

      // サブタスクが1件も無い場合は強制失敗
      if (!hasAnySubtasks) {
        const errorMessage = 'No subtasks were created/saved. Planning/execution may have failed.';
        updateJobStatus(jobId, 'failed', { error: errorMessage });
        try {
          const { getDAOs } = await import('../task-management/db/dao');
          const daos = getDAOs();
          await daos.tasks.updateStatus(jobId, 'failed');
        } catch (dbError) {
          console.warn('⚠️ タスク失敗ステータス更新に失敗:', dbError);
        }
        console.error(`❌ サブタスク未作成のため失敗としてマーク: jobId=${jobId}`);
        return;
      }

      if (resultExists) {
        // 結果ファイルが存在する場合は completed に遷移
        updateJobStatus(jobId, 'completed');
        try {
          const { getDAOs } = await import('../task-management/db/dao');
          const daos = getDAOs();
          await daos.tasks.updateStatus(jobId, 'completed');
        } catch (dbError) {
          console.warn('⚠️ タスク完了ステータス更新に失敗:', dbError);
        }
        logger.info(`エージェントネットワーク実行完了 jobId=${jobId} taskType=${inputData.taskType} time=${executionTime}s ts=${new Date().toISOString()}`);
      } else {
        // 結果が存在しない場合は failed に遷移し、エラーメッセージを保存
        const errorMessage = 'Final result file not found. CEO may have failed to save the final result.';
        updateJobStatus(jobId, 'failed', { error: errorMessage });
        try {
          const { getDAOs } = await import('../task-management/db/dao');
          const daos = getDAOs();
          await daos.tasks.updateStatus(jobId, 'failed');
        } catch (dbError) {
          console.warn('⚠️ タスク失敗ステータス更新に失敗:', dbError);
        }
        console.error(`❌ 最終成果物未保存のため失敗としてマーク: jobId=${jobId} message="${errorMessage}"`);
      }
    } catch (checkError) {
      console.warn('⚠️ 最終成果物チェック中にエラーが発生しました（継続）:', checkError);
      // チェック自体に失敗した場合は従来通り完了でマーク（保守的運用）
      updateJobStatus(jobId, 'completed');
      try {
        const { getDAOs } = await import('../task-management/db/dao');
        const daos = getDAOs();
        await daos.tasks.updateStatus(jobId, 'completed');
      } catch (dbError) {
        console.warn('⚠️ タスク完了ステータス更新に失敗:', dbError);
      }
      logger.info(`エージェントネットワーク実行完了（チェック失敗のため既定完了） jobId=${jobId} time=${executionTime}s`);
    }

  } catch (error) {
    const { classifyError } = await import('../utils/errors');
    const logger = createAgentLogger('AgentNetwork');
    const classification = classifyError(error);
    logger.error(`エージェントネットワークエラー type=${classification} error=${error instanceof Error ? error.message : String(error)}`);
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // ログストアのジョブを失敗としてマーク
    agentLogStore.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
    
    // エラー時のステータス更新とエラー結果の保存
    updateJobStatus(jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // エラー時は結果を直接保存（CEOが処理できないため）
    const errorResult = {
      success: false,
      taskType: inputData.taskType,
      // フロントの履歴モードで参照できるよう、ここでも会話履歴を保存
      conversationHistory: agentLogStore.getJobLog(jobId)?.conversationHistory || [],
      result: null,
      executionSummary: {
        totalIterations: 0,
        agentsInvolved: [],
        executionTime: `${executionTime}s`,
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      errorType: classification,
    };
    
    storeJobResult(jobId, errorResult, 'agent-network');
    
    // タスク管理DBのステータスも更新
    try {
      const { getDAOs } = await import('../task-management/db/dao');
      const daos = getDAOs();
      await daos.tasks.updateStatus(jobId, 'failed');
    } catch (dbError) {
      console.warn('⚠️ タスク失敗ステータスの更新エラー:', dbError);
    }
  }
};

// 汎用エージェントネットワークツール
export const agentNetworkTool = createTool({
  id: 'agent-network-executor',
  description: 'Execute any task through the hierarchical agent network (CEO-Manager-Worker pattern)',
  inputSchema: z.object({
    taskType: z.enum(['web-search', 'slide-generation', 'weather', 'other']).describe('Type of task'),
    taskDescription: z.string().min(1),
    taskParameters: z.record(z.unknown()).describe('Task-specific parameters (object expected)'),
    context: z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
      constraints: z.record(z.unknown()).optional().describe('Any limitations or requirements'),
      expectedOutput: z.string().optional(),
      additionalInstructions: z.string().optional(),
    }).optional(),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.string(),
    taskType: z.string(),
    message: z.string(),
    estimatedTime: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { taskType, taskDescription, taskParameters, context: taskContext } = (context as unknown) as
      | { taskType: 'web-search'; taskDescription: string; taskParameters: { query: string; depth?: 'shallow'|'deep'; language?: string; maxResults?: number }; context?: unknown }
      | { taskType: 'slide-generation'; taskDescription: string; taskParameters: { topic: string; style?: string; pages?: number; language?: string }; context?: unknown }
      | { taskType: 'weather'; taskDescription: string; taskParameters: { location: string; unit?: 'metric'|'imperial'; language?: string }; context?: unknown }
      | { taskType: 'other'; taskDescription: string; taskParameters: Record<string, unknown>; context?: unknown };
    // taskContext は inputSchema に準拠
    // const taskContextTyped is available if needed in future validations
    
    // ジョブIDを生成
    const jobId = `agent-network-${taskType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    const logger = createAgentLogger('AgentNetwork');
    logger.info(`エージェントネットワークタスクを受信 jobId=${jobId} taskType=${taskType} hasRuntimeContext=${!!runtimeContext}`);

    // ジョブを初期化
    initializeJob(jobId);

    // SSE側での404を避けるため、バックグラウンド起動前にログジョブも先行作成
    try {
      const exists = agentLogStore.getJobLog(jobId);
      if (!exists) {
        agentLogStore.createJob(jobId, taskType);
      }
    } catch (e) {
      console.warn('Pre-create agentLogStore job failed:', e);
    }

    // バックグラウンドでエージェントネットワークを実行
    setTimeout(() => {
      // 動的インポートで循環依存を回避
      import('../index').then(({ mastra: mastraInstance }) => {
        executeAgentNetwork(mastraInstance, jobId, {
          jobId,
          taskType,
          taskDescription,
          taskParameters,
          context: taskContext as { priority?: 'low'|'medium'|'high'; constraints?: unknown; expectedOutput?: string; additionalInstructions?: string } | undefined,
        }, runtimeContext);
      });
    }, 0);

    // 推定時間をタスクタイプに基づいて設定
    const estimatedTimes: Record<'web-search' | 'slide-generation' | 'weather' | 'other', string> = {
      'web-search': '15-30 seconds',
      'slide-generation': '30-60 seconds',
      'weather': '5-10 seconds',
      'other': '20-40 seconds'
    };

    return {
      jobId,
      status: 'queued',
      taskType,
      message: `Task has been queued for execution by the agent network. The CEO agent will analyze and delegate this ${taskType} task.`,
      estimatedTime: estimatedTimes[(taskType as 'web-search'|'slide-generation'|'weather'|'other')],
    };
  },
});