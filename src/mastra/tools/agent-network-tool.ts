import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
type AnyModel = ReturnType<typeof openai>;
import { sharedMemory } from '../shared-memory';
import { getAgentPrompt } from '../prompts/agent-prompts';
import { taskViewerTool } from '../task-management/tools/task-viewer-tool';
import { finalResultTool } from '../task-management/tools/final-result-tool';
import { policyManagementTool, policyCheckTool } from '../task-management/tools/policy-management-tool';
import { taskManagementTool } from '../task-management/tools/task-management-tool';
import { batchTaskCreationTool } from '../task-management/tools/batch-task-creation-tool';
import { directiveManagementTool } from '../task-management/tools/directive-management-tool';
import { exaMCPSearchTool } from '../tools/exa-search-wrapper';
import { agentLogStore, formatAgentMessage } from '../utils/agent-log-store';

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
    console.log('🚀 エージェントネットワーク実行開始:', {
      jobId,
      taskType: inputData.taskType,
      timestamp: new Date().toISOString()
    });

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
      
      console.log('✅ タスクをタスク管理DBに登録:', jobId);
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

    const resolveModel = (modelType?: string): { aiModel: AnyModel; info: { provider: string; modelId: string; displayName: string } } => {
      switch (modelType) {
        case 'gpt-5':
          return { aiModel: openai('gpt-5'), info: { provider: 'OpenAI', modelId: 'gpt-5', displayName: 'GPT-5' } };
        case 'openai-o3':
          return { aiModel: openai('o3-2025-04-16'), info: { provider: 'OpenAI', modelId: 'o3-2025-04-16', displayName: 'OpenAI o3' } };
        case 'gemini-2.5-flash':
          return { aiModel: google('gemini-2.5-flash'), info: { provider: 'Google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' } };
        case 'claude-sonnet-4':
        default:
          return { aiModel: anthropic('claude-sonnet-4-20250514'), info: { provider: 'Anthropic', modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' } };
      }
    };

    const { aiModel: networkModel, info: networkModelInfo } = resolveModel(selectedModelType);
    console.log(`🤝 エージェントネットワーク用モデル: ${networkModelInfo.displayName} (${networkModelInfo.provider})`);

    // 選択モデルで各ロールのエージェントを動的生成
    const ceoAgent = new Agent({
      name: 'CEO Agent - Strategic Task Director',
      instructions: getAgentPrompt('CEO'),
      model: networkModel,
      tools: { taskViewerTool, finalResultTool, policyManagementTool },
      memory: sharedMemory,
    });

    const managerAgent = new Agent({
      name: 'Manager Agent - Task Planner & Coordinator',
      instructions: getAgentPrompt('MANAGER'),
      model: networkModel,
      tools: { taskManagementTool, batchTaskCreationTool, directiveManagementTool, policyCheckTool },
      memory: sharedMemory,
    });

    const workerAgent = new Agent({
      name: 'Worker Agent - Task Executor',
      instructions: getAgentPrompt('WORKER'),
      model: networkModel,
      tools: { exaMCPSearchTool },
      memory: sharedMemory,
    });

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
    const agentNetwork = new NewAgentNetwork({
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
        'ceo': ceoAgent as Agent,
        'manager': managerAgent as Agent,
        'worker': workerAgent as Agent,
      },
      defaultAgent: managerAgent as Agent,
      // memoryはDynamicArgument型（関数）を要求される環境があるため、関数ラッパで適合させる
      memory: (memory ? (() => memory) : undefined) as undefined,
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

    console.log('🎯 ネットワークプロンプト:', networkPrompt);

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
    
    console.log('🚀 エージェントネットワーク実行オプション:', networkOptions);
    
    // let result; // CEOエージェントが最終成果物を管理するため不要
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversationHistory: any[] = [];
    let iterationCounter = 1;
    
    // エージェントネットワークを実行
    console.log(`🎯 NewAgentNetwork実行開始 - jobId: ${jobId}`);
    
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
        console.log('🌊 ストリームオブジェクトを取得');
        
        const agentOutputs = new Map<string, { 
          id: string, 
          name: string, 
          content: string,
          lastSentLength: number,
          entryId?: string,
          isSent: boolean,
          iteration: number
        }>();
        let currentStreamingAgent: { id: string, name: string } | null = null;
        let lastActiveAgent: string | null = null;
        const processedMessageIds = new Set<string>();
        
        // ストリームからイベントを処理
        for await (const chunk of streamResult.stream) {
          
          // エージェントルーティングイベント
          if (chunk.type === 'agent-routing') {
            const routingInfo = chunk.data;
            console.log(`🔀 エージェントルーティング: ${routingInfo.fromAgent} → ${routingInfo.toAgent}`);
            
            const routingEntry = formatAgentMessage(
              'system',
              'Network Router',
              `ルーティング: ${routingInfo.fromAgent} → ${routingInfo.toAgent}\n理由: ${routingInfo.reason || 'N/A'}`,
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
            
            const guessFrom = (v?: string) => {
              const s = (v || '').toLowerCase();
              if (s.includes('ceo')) return { id: 'ceo', name: 'CEO Agent' } as const;
              if (s.includes('manager')) return { id: 'manager', name: 'Manager Agent' } as const;
              if (s.includes('worker')) return { id: 'worker', name: 'Worker Agent' } as const;
              return null;
            };
            const g = guessFrom(chunk.name) || guessFrom(chunk.toolName);
            if (g) { agentId = g.id; agentName = g.name; }
            else if (chunk.name) { agentName = chunk.name; agentId = chunk.name.toLowerCase().replace(/\s+/g, '-'); }
            
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
            
            if (chunk.name) {
              if (chunk.name.toLowerCase().includes('ceo')) {
                agentId = 'ceo';
                agentName = 'CEO Agent';
              } else if (chunk.name.toLowerCase().includes('manager')) {
                agentId = 'manager';
                agentName = 'Manager Agent';
              } else if (chunk.name.toLowerCase().includes('worker')) {
                agentId = 'worker';
                agentName = 'Worker Agent';
              } else {
                agentName = chunk.name;
                agentId = chunk.name.toLowerCase().replace(/\s+/g, '-');
              }
            }
            
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
              iteration: iterationCounter
            });
            
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
          
          // テキストデルタ
          if (chunk.type === 'tool-call-delta' && currentStreamingAgent && chunk.argsTextDelta) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput) {
              agentOutput.content += chunk.argsTextDelta;
            }
          }
          // 追加: agentからの直接text-delta
          if (chunk.type === 'text-delta' && currentStreamingAgent && chunk.textDelta) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput) {
              agentOutput.content += chunk.textDelta;
            }
          }
          
          // ツール呼び出し完了
          if (chunk.type === 'tool-call-streaming-finish' && currentStreamingAgent) {
            const agentOutput = agentOutputs.get(currentStreamingAgent.id);
            if (agentOutput && agentOutput.content && !agentOutput.isSent) {
              console.log(`✅ ${currentStreamingAgent.name}の応答完了 - ${agentOutput.content.length}文字`);
              
              const finalEntry = formatAgentMessage(
                currentStreamingAgent.id,
                currentStreamingAgent.name,
                agentOutput.content,
                agentOutput.iteration,
                'response'
              );
              
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
              const output = (chunk as { payload?: { output?: unknown } }).payload?.output as Record<string, unknown> | undefined;
              let agentId = 'unknown';
              let agentName = 'Unknown Agent';
              const rid = String(output?.resourceId || '').toLowerCase();
              if (rid.includes('ceo')) { agentId = 'ceo'; agentName = 'CEO Agent'; }
              else if (rid.includes('manager')) { agentId = 'manager'; agentName = 'Manager Agent'; }
              else if (rid.includes('worker')) { agentId = 'worker'; agentName = 'Worker Agent'; }

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
              const data = (chunk as { data?: unknown }).data || chunk;
              const content = (data as Record<string, unknown>)?.content as string || (data as Record<string, unknown>)?.text as string;
              if (content) {
                let agentId = 'system';
                let agentName = 'System';
                const raw = String((data as Record<string, unknown>)?.agentId || (data as Record<string, unknown>)?.name || '').toLowerCase();
                if (raw.includes('ceo')) { agentId = 'ceo'; agentName = 'CEO Agent'; }
                else if (raw.includes('manager')) { agentId = 'manager'; agentName = 'Manager Agent'; }
                else if (raw.includes('worker')) { agentId = 'worker'; agentName = 'Worker Agent'; }

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
          if (chunk.type === 'tool-result' && chunk.result) {
            let agentId = currentStreamingAgent?.id || 'unknown';
            let agentName = currentStreamingAgent?.name || 'Unknown Agent';
            const guessFrom = (v?: string) => {
              const s = (v || '').toLowerCase();
              if (s.includes('ceo')) return { id: 'ceo', name: 'CEO Agent' } as const;
              if (s.includes('manager')) return { id: 'manager', name: 'Manager Agent' } as const;
              if (s.includes('worker')) return { id: 'worker', name: 'Worker Agent' } as const;
              return null;
            };
            const g = guessFrom(chunk.name) || guessFrom(chunk.toolName) || guessFrom((chunk.result as Record<string, unknown>)?.resourceId as string);
            if (g) { agentId = g.id; agentName = g.name; }
            
            const agentOutput = currentStreamingAgent ? agentOutputs.get(currentStreamingAgent.id) : undefined;
            if (agentOutput && agentOutput.content) {
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
              currentStreamingAgent = null;
            } else {
              const resultText = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result);
              const finalEntry = formatAgentMessage(
                agentId,
                agentName,
                resultText,
                iterationCounter,
                'response'
              );
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
      console.log('📌 通常のloopメソッドを使用');
      // result = await agentNetwork.loop(networkPrompt, networkOptions); // CEOが最終成果物を管理するため不要
      await agentNetwork.loop(networkPrompt, networkOptions);
    }
    
    console.log(`🎯 NewAgentNetwork実行完了`);
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // 実行サマリーを作成
    const executionSummary = {
      totalIterations: conversationHistory.length || 3,
      agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
      executionTime: `${executionTime}s`,
    };
    
    // ログストアのジョブを完了としてマーク
    agentLogStore.completeJob(jobId, executionSummary);
    
    // CEOエージェントが小タスクの結果を統合して最終成果物を生成・保存する
    // agent-network-tool.tsではジョブステータスの更新のみ行う

    console.log('✅ エージェントネットワーク実行完了:', {
      jobId,
      taskType: inputData.taskType,
      executionTime: `${executionTime}s`,
      timestamp: new Date().toISOString()
    });

    // ジョブステータスのみ更新（結果の保存はCEOエージェントが行う）
    updateJobStatus(jobId, 'completed');
    console.log('📝 ジョブステータスを完了に更新しました:', jobId);
    console.log('⏳ CEOエージェントが最終成果物を保存します');
    
    // タスク管理DBのステータスも更新
    try {
      const { getDAOs } = await import('../task-management/db/dao');
      const daos = getDAOs();
      await daos.tasks.updateStatus(jobId, 'completed');
      
      // 成果物として結果を保存（現在は無効化）
      // TODO: artifactの保存を別の方法で実装
      /*
      if (inputData.taskType === 'slide-generation' && finalResult && typeof finalResult === 'object' && 'htmlCode' in finalResult) {
        const slideResult = finalResult as { htmlCode: string; topic?: string; slideCount?: number; style?: string };
        // artifact保存処理をここに実装
        console.log('📦 スライドHTMLの成果物保存はスキップ（将来実装予定）');
      }
      */
    } catch (dbError) {
      console.warn('⚠️ タスク完了処理でエラー:', dbError);
    }

  } catch (error) {
    console.error('❌ エージェントネットワークエラー:', error);
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // ログストアのジョブを失敗としてマーク
    agentLogStore.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
    
    // エラー時のステータス更新とエラー結果の保存
    updateJobStatus(jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // エラー時は結果を直接保存（CEOが処理できないため）
    const errorResult = {
      success: false,
      taskType: inputData.taskType,
      result: null,
      executionSummary: {
        totalIterations: 0,
        agentsInvolved: [],
        executionTime: `${executionTime}s`,
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred',
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
    taskType: z.string().describe('Type of task: web-search, slide-generation, weather, etc.'),
    taskDescription: z.string().describe('Detailed description of what needs to be done'),
    taskParameters: z.any().describe('Task-specific parameters (query, location, topic, etc.)'),
    context: z.object({
      priority: z.enum(['low', 'medium', 'high']).optional(),
      constraints: z.any().optional().describe('Any limitations or requirements'),
      expectedOutput: z.string().optional().describe('Description of expected output format'),
      additionalInstructions: z.string().optional().describe('Any additional instructions for the agents'),
    }).optional().describe('Additional context for task execution'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.string(),
    taskType: z.string(),
    message: z.string(),
    estimatedTime: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { taskType, taskDescription, taskParameters, context: taskContext } = context;
    
    // ジョブIDを生成
    const jobId = `agent-network-${taskType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    console.log('🎯 エージェントネットワークタスクを受信:', {
      jobId,
      taskType,
      taskDescription,
      hasRuntimeContext: !!runtimeContext
    });

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
          context: taskContext,
        }, runtimeContext);
      });
    }, 0);

    // 推定時間をタスクタイプに基づいて設定
    const estimatedTimes: Record<string, string> = {
      'web-search': '15-30 seconds',
      'slide-generation': '30-60 seconds',
      'weather': '5-10 seconds',
      'default': '20-40 seconds'
    };

    return {
      jobId,
      status: 'queued',
      taskType,
      message: `Task has been queued for execution by the agent network. The CEO agent will analyze and delegate this ${taskType} task.`,
      estimatedTime: estimatedTimes[taskType] || estimatedTimes.default,
    };
  },
});