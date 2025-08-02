import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { anthropic } from '@ai-sdk/anthropic';

// 入力スキーマ
const inputSchema = z.object({
  taskType: z.string(),
  taskDescription: z.string(),
  taskParameters: z.any(),
  jobId: z.string().optional(), // ジョブIDを追加
  context: z.object({
    priority: z.enum(['low', 'medium', 'high']).optional(),
    constraints: z.any().optional(),
    expectedOutput: z.string().optional(),
    additionalInstructions: z.string().optional(),
  }).optional(),
});

// 会話ログの型定義
const conversationEntrySchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  message: z.string(),
  timestamp: z.string(),
  iteration: z.number(),
  messageType: z.enum(['request', 'response', 'internal']).optional(),
  metadata: z.object({
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    tokenCount: z.number().optional(),
    executionTime: z.number().optional(),
  }).optional(),
});

// 出力スキーマ
const outputSchema = z.object({
  success: z.boolean(),
  taskType: z.string(),
  result: z.any(),
  executionSummary: z.object({
    totalIterations: z.number(),
    agentsInvolved: z.array(z.string()),
    executionTime: z.string(),
  }).optional(),
  conversationHistory: z.array(conversationEntrySchema).optional(),
  error: z.string().optional(),
});

// エージェントネットワーク実行ステップ
const agentNetworkStep = createStep({
  id: 'agent-network-execution',
  description: 'Execute task through CEO-Manager-Worker agent network',
  inputSchema,
  outputSchema,
  execute: async ({ inputData, runtimeContext, mastra }) => {
    const startTime = Date.now();
    
    // ジョブIDを生成または使用
    const jobId = inputData.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    try {
      console.log('🌐 エージェントネットワークワークフロー開始:', {
        jobId,
        taskType: inputData.taskType,
        hasRuntimeContext: !!runtimeContext,
        timestamp: new Date().toISOString(),
      });

      // Mastraインスタンスが利用可能か確認
      if (!mastra) {
        throw new Error('Mastraインスタンスが利用できません');
      }

      // エージェントを取得
      const ceoAgentOriginal = mastra.getAgent('ceo-agent');
      const managerAgentOriginal = mastra.getAgent('manager-agent');
      const workerAgentOriginal = mastra.getAgent('worker-agent');

      if (!ceoAgentOriginal || !managerAgentOriginal || !workerAgentOriginal) {
        throw new Error('必要なエージェントが見つかりません');
      }
      
      // エージェントをそのまま使用（watch-v2イベントでログを取得）
      const ceoAgent = ceoAgentOriginal;
      const managerAgent = managerAgentOriginal;
      const workerAgent = workerAgentOriginal;

      // メモリ設定を準備
      const resourceId = runtimeContext?.get('resourceId') as string | undefined;
      const threadId = runtimeContext?.get('threadId') as string | undefined;
      const memoryConfig = resourceId && threadId ? {
        resource: resourceId,
        thread: threadId,
      } : undefined;

      // メモリを取得（会話履歴を追跡するため）
      const memory = memoryConfig ? mastra?.getMemory() : undefined;
      
      // エージェントネットワークを作成
      const agentNetwork = new NewAgentNetwork({
        id: 'task-execution-network',
        name: 'Task Execution Network',
        instructions: `Coordinate task execution through CEO-Manager-Worker hierarchy. The network automatically routes between agents based on the conversation flow.
        
IMPORTANT ROUTING RULES:
- CEO provides strategic direction ONCE then stops
- Manager creates execution plan ONCE then waits for Worker
- Worker executes task ONCE and signals completion
- When task is marked complete (✅/❌/⚠️), terminate the loop`,
        model: anthropic('claude-sonnet-4-20250514'),
        agents: {
          'ceo': ceoAgent,
          'manager': managerAgent,
          'worker': workerAgent,
        },
        defaultAgent: ceoAgent,
        memory: memory,
      });

      // タスクコンテキストを準備
      // taskParametersが文字列の場合はパースする
      let parsedParameters = inputData.taskParameters;
      if (typeof inputData.taskParameters === 'string') {
        try {
          parsedParameters = JSON.parse(inputData.taskParameters);
        } catch (e) {
          // パースできない場合はそのまま使用
          console.warn('taskParametersのパースに失敗しました:', e);
        }
      }

      const networkPrompt = `
Execute the following task:
Type: ${inputData.taskType}
Description: ${inputData.taskDescription}
Parameters: ${JSON.stringify(parsedParameters, null, 2)}
${inputData.context?.expectedOutput ? `Expected Output: ${inputData.context.expectedOutput}` : ''}
${inputData.context?.constraints ? `Constraints: ${JSON.stringify(inputData.context.constraints)}` : ''}
${inputData.context?.additionalInstructions ? `Additional Instructions: ${inputData.context.additionalInstructions}` : ''}

Priority: ${inputData.context?.priority || 'medium'}

As the CEO agent, analyze this task and provide strategic direction. The agent network will automatically route your guidance to the appropriate agents for planning and execution.
`;

      console.log('🎯 ネットワークプロンプト:', networkPrompt);

      // 会話履歴は不要（watch-v2イベントで取得）

      // エージェントネットワークを実行
      console.log('🔄 エージェントネットワーク実行開始...');
      console.log('📊 設定: maxIterations=10, defaultAgent=CEO');
      console.log('📋 エージェント:');
      console.log('  - CEO: 戦略的指示 (1回のみ応答)');
      console.log('  - Manager: 実行計画作成 (1回のみ)');
      console.log('  - Worker: タスク実行と完了シグナル');
      console.log('🔍 ログ記録: watch-v2イベント経由');

      // カスタムオプションでエージェントネットワークのloopメソッドを実行
      const networkOptions = {
        maxIterations: 10, // 最大10回のエージェント間やり取り
        // デバッグモードを環境変数で制御
        debug: process.env.AGENT_NETWORK_DEBUG === 'true',
        // ストリーミングを有効化して中間結果をキャプチャ
        stream: true,
      };
      
      console.log('🚀 エージェントネットワーク実行オプション:', networkOptions);
      
      // ネットワーク実行前のタイムスタンプ
      const networkStartTime = Date.now();
      
      let result;
      let conversationHistory: any[] = [];
      let iterationCounter = 0;
      
      // jobIdをコンテキストに追加（エージェントがアクセスできるように）
      if (runtimeContext && jobId) {
        runtimeContext.set('currentJobId', jobId);
        runtimeContext.set('taskType', inputData.taskType);
      }

      // ログストアをインポート（動的インポートで循環依存を回避）
      let agentLogStore: any;
      let formatAgentMessage: any;
      try {
        const logModule = await import('../utils/agent-log-store');
        agentLogStore = logModule.agentLogStore;
        formatAgentMessage = logModule.formatAgentMessage;
      } catch (error) {
        console.error('❌ agentLogStoreのインポートエラー:', error);
      }
      
      // ログストアが利用可能な場合、ジョブを作成
      if (agentLogStore && jobId) {
        const jobLog = agentLogStore.getJobLog(jobId);
        if (!jobLog) {
          agentLogStore.createJob(jobId, inputData.taskType);
        }
      }

      try {
        // エージェントネットワークのloopStreamメソッドが存在するか確認
        console.log(`🎯 NewAgentNetwork実行開始 - jobId: ${jobId}`);
        console.log(`🎯 JobIdをruntimeContextに設定: ${jobId}`);
        
        // loopStreamメソッドが存在する場合はそれを使用
        if (typeof (agentNetwork as any).loopStream === 'function') {
          console.log('🌊 loopStreamメソッドを使用してストリーミング実行');
          
          const streamResult = await (agentNetwork as any).loopStream(
            networkPrompt,
            {
              ...networkOptions,
              threadId: memoryConfig?.thread,
              resourceId: memoryConfig?.resource,
              runtimeContext
            }
          );
          
          // ストリームの型を確認
          if (streamResult && streamResult.stream) {
            console.log('🌊 ストリームオブジェクトを取得');
            
            // 各エージェントの出力を蓄積するマップ
            const agentOutputs = new Map<string, { 
              id: string, 
              name: string, 
              content: string,
              lastSentLength: number, // 最後に送信した長さを記録
              entryId?: string, // エントリIDを保持
              isSent: boolean // 送信済みフラグ
            }>();
            let currentStreamingAgent: { id: string, name: string } | null = null;
            
            // イベントカウンタ（デバッグ用）
            const eventCounts = {
              'tool-call-streaming-start': 0,
              'tool-call-delta': 0,
              'tool-call-streaming-finish': 0,
              'step-result': 0,
              'step-finish': 0,
              'tool-result': 0
            };
            
            // メモリポーリング用の設定（無効化）
            // エージェント出力はストリームイベントから取得するため、メモリポーリングは不要
            let lastMemoryCheck = Date.now();
            let lastMessageCount = 0;
            const MEMORY_POLLING_INTERVAL = 60000; // 60秒に延長（実質的に無効化）
            const processedMessageIds = new Set<string>(); // 処理済みメッセージIDを記録
            
            // メモリから会話履歴を定期的にチェックする関数
            const checkMemoryForNewMessages = async () => {
              if (!memory || !memoryConfig || !agentLogStore) return;
              
              const now = Date.now();
              if (now - lastMemoryCheck < MEMORY_POLLING_INTERVAL) return;
              
              lastMemoryCheck = now;
              
              try {
                const messages = await memory.getMessages({
                  resourceId: memoryConfig.resource,
                  threadId: memoryConfig.thread,
                });
                
                if (messages.length > lastMessageCount) {
                  console.log(`📜 新しいメッセージを検出: ${messages.length - lastMessageCount}件`);
                  
                  // 新しいメッセージのみを処理
                  const newMessages = messages.slice(lastMessageCount);
                  
                  for (const msg of newMessages) {
                    let agentId = 'system';
                    let agentName = 'System';
                    
                    if (msg.content) {
                      const content = msg.content.toLowerCase();
                      if (content.includes('ceo') || content.includes('strategic')) {
                        agentId = 'ceo';
                        agentName = 'CEO Agent';
                      } else if (content.includes('manager') || content.includes('plan')) {
                        agentId = 'manager';
                        agentName = 'Manager Agent';
                      } else if (content.includes('worker') || content.includes('execute')) {
                        agentId = 'worker';
                        agentName = 'Worker Agent';
                      }
                    }
                    
                    const conversationEntry = formatAgentMessage(
                      agentId,
                      agentName,
                      msg.content || '',
                      iterationCounter + 1,
                      msg.role === 'user' ? 'request' : 'response'
                    );
                    
                    agentLogStore.addLogEntry(jobId, conversationEntry);
                    conversationHistory.push(conversationEntry);
                  }
                  
                  lastMessageCount = messages.length;
                }
              } catch (error) {
                console.error('❌ メモリチェックエラー:', error);
              }
            };
            
            // ストリームからイベントを処理
            let eventCounter = 0;
            for await (const chunk of streamResult.stream) {
              eventCounter++;
              
              // イベントカウントを更新
              if (chunk.type in eventCounts) {
                eventCounts[chunk.type as keyof typeof eventCounts]++;
              }
              
              // 特定のイベントタイプに対してより詳細なログ
              if (chunk.type === 'tool-call-streaming-finish' || 
                  chunk.type === 'step-finish' || 
                  chunk.type === 'tool-call-delta') {
                console.log(`🎯 重要イベント #${eventCounter} - ${chunk.type}:`, JSON.stringify(chunk, null, 2));
              } else {
                console.log(`📡 ストリームイベント受信 #${eventCounter}:`, {
                  type: chunk.type,
                  hasData: !!chunk.data,
                  hasArgs: !!chunk.args,
                  hasArgsTextDelta: !!chunk.argsTextDelta,
                  hasName: !!chunk.name,
                  dataPreview: chunk.data ? JSON.stringify(chunk.data).substring(0, 100) + '...' : undefined,
                  argsPreview: chunk.args ? JSON.stringify(chunk.args).substring(0, 100) + '...' : undefined,
                  nameValue: chunk.name,
                  argsTextDeltaPreview: chunk.argsTextDelta?.substring(0, 50)
                });
              }
              
              if (chunk.type === 'agent-routing') {
                iterationCounter++;
                const routingInfo = chunk.data;
                console.log(`🔀 エージェントルーティング: ${routingInfo.fromAgent} → ${routingInfo.toAgent}`);
                
                if (agentLogStore && jobId) {
                  const routingEntry = formatAgentMessage(
                    'system',
                    'Network Router',
                    `ルーティング: ${routingInfo.fromAgent} → ${routingInfo.toAgent}\n理由: ${routingInfo.reason || 'N/A'}`,
                    iterationCounter,
                    'internal'
                  );
                  agentLogStore.addLogEntry(jobId, routingEntry);
                }
              }
              
              // step-resultイベントも処理
              if (chunk.type === 'step-result') {
                console.log(`📊 step-resultイベント:`, {
                  payload: chunk.payload ? JSON.stringify(chunk.payload).substring(0, 200) : 'no payload',
                  hasPayload: !!chunk.payload,
                  hasOutput: !!chunk.payload?.output,
                  stepId: chunk.stepId
                });
                
                // agent-stepの結果の場合、エージェント出力を確認
                if (chunk.stepId === 'agent-step' && chunk.payload?.output?.result) {
                  const output = chunk.payload.output;
                  
                  // エージェントIDから現在のエージェントを特定
                  let agentId = 'system';
                  let agentName = 'System';
                  
                  if (output.resourceId) {
                    if (output.resourceId.includes('ceo')) {
                      agentId = 'ceo';
                      agentName = 'CEO Agent';
                    } else if (output.resourceId.includes('manager')) {
                      agentId = 'manager';
                      agentName = 'Manager Agent';
                    } else if (output.resourceId.includes('worker')) {
                      agentId = 'worker';
                      agentName = 'Worker Agent';
                    }
                  }
                  
                  const agentOutput = agentOutputs.get(agentId);
                  
                  // 蓄積された出力がある場合はそれを送信
                  if (agentOutput && agentOutput.content && agentOutput.content.length > agentOutput.lastSentLength) {
                    console.log(`📤 step-resultでエージェント出力を送信: ${agentName} - ${agentOutput.content.length}文字`);
                    
                    const finalEntry = formatAgentMessage(
                      agentId,
                      agentName,
                      agentOutput.content,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      agentLogStore.addLogEntry(jobId, finalEntry);
                    }
                    
                    conversationHistory.push(finalEntry);
                    agentOutputs.delete(agentId);
                    
                    // currentStreamingAgentもクリア
                    if (currentStreamingAgent && currentStreamingAgent.id === agentId) {
                      currentStreamingAgent = null;
                    }
                  }
                }
              }
              
              if (chunk.type === 'agent-message' || chunk.type === 'message') {
                const messageData = chunk.data || chunk;
                console.log(`💬 エージェントメッセージ: ${messageData.agentId || 'unknown'} - ${messageData.content?.substring(0, 50)}...`);
                
                // agent-messageイベントは処理しない（tool-call-streaming-finishで処理するため）
                // これにより重複を防ぐ
              }
              
              // ツール呼び出しイベントも処理
              if (chunk.type === 'tool-call-streaming-start') {
                console.log(`🔧 ツール呼び出し開始:`, {
                  type: chunk.type,
                  name: chunk.name,
                  toolName: chunk.toolName,
                  args: chunk.args,
                  fullChunk: JSON.stringify(chunk)
                });
                
                const agentName = chunk.name || chunk.toolName || '';
                let agentId = 'system';
                
                // chunk.argsから実際のエージェントIDを取得する試み
                if (chunk.args?.resourceId) {
                  if (chunk.args.resourceId.includes('ceo')) {
                    agentId = 'ceo';
                  } else if (chunk.args.resourceId.includes('manager')) {
                    agentId = 'manager';
                  } else if (chunk.args.resourceId.includes('worker')) {
                    agentId = 'worker';
                  }
                } else if (agentName.toLowerCase().includes('ceo')) {
                  agentId = 'ceo';
                } else if (agentName.toLowerCase().includes('manager')) {
                  agentId = 'manager';
                } else if (agentName.toLowerCase().includes('worker')) {
                  agentId = 'worker';
                }
                
                console.log(`🎯 エージェント識別結果: agentId=${agentId}, agentName=${agentName}`);
                
                // 現在ストリーミング中のエージェントを記録
                currentStreamingAgent = { id: agentId, name: agentName };
                agentOutputs.set(agentId, { 
                  id: agentId, 
                  name: agentName, 
                  content: '',
                  lastSentLength: 0,
                  entryId: `${jobId}-${agentId}-${iterationCounter}-stream`,
                  isSent: false
                });
                
                if (agentLogStore && jobId) {
                  iterationCounter++;
                  // 重複チェック用のキー
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
              }
              
              if (chunk.type === 'tool-call-delta') {
                console.log(`📝 部分出力受信:`, {
                  hasArgsTextDelta: !!chunk.argsTextDelta,
                  argsTextDeltaLength: chunk.argsTextDelta?.length,
                  argsTextDeltaPreview: chunk.argsTextDelta?.substring(0, 100),
                  currentStreamingAgent: currentStreamingAgent,
                  fullChunk: JSON.stringify(chunk)
                });
                
                // 現在のエージェントの出力に追加
                if (!currentStreamingAgent) {
                  console.warn('⚠️ currentStreamingAgentが設定されていません');
                  // tool-call-streaming-startを見逃した場合の対処
                  // chunk.argsからエージェントを特定する試み
                  if (chunk.args?.resourceId) {
                    let agentId = 'system';
                    let agentName = 'System';
                    
                    if (chunk.args.resourceId.includes('ceo')) {
                      agentId = 'ceo';
                      agentName = 'CEO Agent';
                    } else if (chunk.args.resourceId.includes('manager')) {
                      agentId = 'manager';
                      agentName = 'Manager Agent';
                    } else if (chunk.args.resourceId.includes('worker')) {
                      agentId = 'worker';
                      agentName = 'Worker Agent';
                    }
                    
                    currentStreamingAgent = { id: agentId, name: agentName };
                    agentOutputs.set(agentId, { 
                      id: agentId, 
                      name: agentName, 
                      content: '',
                      lastSentLength: 0,
                      entryId: `${jobId}-${agentId}-${iterationCounter}-stream`,
                      isSent: false
                    });
                    console.log(`🔄 currentStreamingAgentを復元: ${agentId}`);
                  }
                }
                
                if (currentStreamingAgent && chunk.argsTextDelta) {
                  const agentOutput = agentOutputs.get(currentStreamingAgent.id);
                  if (agentOutput) {
                    const previousLength = agentOutput.content.length;
                    agentOutput.content += chunk.argsTextDelta;
                    console.log(`📊 エージェント出力蓄積中: ${currentStreamingAgent.id} - ${previousLength}文字 → ${agentOutput.content.length}文字`);
                    console.log(`   内容プレビュー: "${agentOutput.content.substring(agentOutput.content.length - 50)}"`);
                    
                    // ストリーミング中は蓄積のみ行い、一切送信しない
                    // 完了時（tool-call-streaming-finish）に全文をまとめて送信
                  } else {
                    console.warn(`⚠️ agentOutputが見つかりません: ${currentStreamingAgent.id}`);
                    console.warn(`   現在のagentOutputs:`, Array.from(agentOutputs.keys()));
                  }
                } else {
                  if (!currentStreamingAgent) {
                    console.warn('⚠️ currentStreamingAgentが設定されていません（復元失敗）');
                  }
                  if (!chunk.argsTextDelta) {
                    console.warn('⚠️ chunk.argsTextDeltaが空です');
                  }
                }
              }
              
              if (chunk.type === 'tool-call-streaming-finish') {
                console.log(`🛠️ ツール完了:`, chunk);
                
                // エージェントの応答が完了したので、蓄積した全文を一度に送信
                if (currentStreamingAgent) {
                  const agentOutput = agentOutputs.get(currentStreamingAgent.id);
                  if (agentOutput && agentOutput.content && !agentOutput.isSent) {
                    console.log(`✅ ${currentStreamingAgent.name}の応答完了 - ${agentOutput.content.length}文字`);
                    
                    const finalEntry = formatAgentMessage(
                      currentStreamingAgent.id,
                      currentStreamingAgent.name,
                      agentOutput.content,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      console.log(`📤 ${currentStreamingAgent.name}の完全な出力を送信`);
                      agentLogStore.addLogEntry(jobId, finalEntry);
                      agentOutput.isSent = true; // 送信済みとしてマーク
                    }
                    
                    conversationHistory.push(finalEntry);
                    
                    // エージェント出力をクリアして次のエージェントに備える
                    agentOutputs.delete(currentStreamingAgent.id);
                  }
                  currentStreamingAgent = null;
                }
              }
              
              // text-deltaイベントも処理（エージェントからの直接的なテキストストリーム）
              if (chunk.type === 'text-delta') {
                console.log(`📝 text-deltaイベント:`, {
                  textDelta: chunk.textDelta?.substring(0, 100),
                  hasTextDelta: !!chunk.textDelta
                });
                
                if (currentStreamingAgent && chunk.textDelta) {
                  const agentOutput = agentOutputs.get(currentStreamingAgent.id);
                  if (agentOutput) {
                    agentOutput.content += chunk.textDelta;
                    console.log(`📊 text-delta蓄積中: ${currentStreamingAgent.id} - ${agentOutput.content.length}文字`);
                    
                    // text-deltaも同様に、ストリーミング中は蓄積のみ行い送信しない
                  }
                }
              }
              
              // tool-resultイベントで最終結果を確認
              if (chunk.type === 'tool-result') {
                console.log(`🎯 tool-resultイベント:`, {
                  result: chunk.result ? JSON.stringify(chunk.result).substring(0, 200) : 'no result',
                  hasResult: !!chunk.result
                });
                
                // tool-resultは通常tool-call-streaming-finishの後に来るので、
                // すでに送信済みの場合はスキップ
                // もし、tool-call-streaming-finishが来ない場合のフォールバックとして機能
                if (currentStreamingAgent && chunk.result) {
                  const agentOutput = agentOutputs.get(currentStreamingAgent.id);
                  
                  // エージェント出力が蓄積されている場合は、それを送信
                  if (agentOutput && agentOutput.content && agentOutput.content.length > agentOutput.lastSentLength) {
                    console.log(`📤 tool-resultでエージェント出力を送信: ${currentStreamingAgent.name} - ${agentOutput.content.length}文字`);
                    
                    const finalEntry = formatAgentMessage(
                      currentStreamingAgent.id,
                      currentStreamingAgent.name,
                      agentOutput.content,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      agentLogStore.addLogEntry(jobId, finalEntry);
                    }
                    
                    conversationHistory.push(finalEntry);
                    agentOutputs.delete(currentStreamingAgent.id);
                    currentStreamingAgent = null;
                  } else if (!agentOutput || !agentOutput.content) {
                    // エージェント出力がない場合は、tool-resultの内容を直接送信
                    const resultText = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result);
                    console.log(`📤 tool-resultの内容を直接送信: ${currentStreamingAgent?.name || 'unknown'}`);
                    
                    const finalEntry = formatAgentMessage(
                      currentStreamingAgent.id,
                      currentStreamingAgent.name,
                      resultText,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      agentLogStore.addLogEntry(jobId, finalEntry);
                    }
                    
                    conversationHistory.push(finalEntry);
                    currentStreamingAgent = null;
                  }
                }
              }
              
              // step-finishイベントでもエージェント出力を送信（フォールバック）
              if (chunk.type === 'step-finish') {
                console.log(`🏁 step-finishイベント:`, {
                  stepId: chunk.stepId,
                  payload: chunk.payload ? JSON.stringify(chunk.payload).substring(0, 200) : 'no payload'
                });
                
                // 現在のエージェントの出力がまだ送信されていない場合は送信
                if (currentStreamingAgent) {
                  const agentOutput = agentOutputs.get(currentStreamingAgent.id);
                  if (agentOutput && agentOutput.content && !agentOutput.isSent) {
                    console.log(`⚠️ step-finishでフォールバック送信: ${currentStreamingAgent.name} - ${agentOutput.content.length}文字`);
                    
                    const finalEntry = formatAgentMessage(
                      currentStreamingAgent.id,
                      currentStreamingAgent.name,
                      agentOutput.content,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      console.log(`📤 ${currentStreamingAgent.name}の出力を送信（step-finish）`);
                      agentLogStore.addLogEntry(jobId, finalEntry);
                      agentOutput.isSent = true; // 送信済みとしてマーク
                    }
                    
                    conversationHistory.push(finalEntry);
                    agentOutputs.delete(currentStreamingAgent.id);
                    currentStreamingAgent = null;
                  }
                }
              }
              
              if (chunk.type === 'finish') {
                result = chunk.data || chunk.result;
                console.log(`🏁 エージェントネットワーク実行完了:`, {
                  hasResult: !!result,
                  resultPreview: result ? JSON.stringify(result).substring(0, 200) : 'no result'
                });
                
                // 最終チェック：まだ送信されていないエージェント出力があれば送信
                for (const [agentId, agentOutput] of agentOutputs.entries()) {
                  if (agentOutput.content && !agentOutput.isSent) {
                    console.log(`⚠️ 最終送信: ${agentOutput.name} - ${agentOutput.content.length}文字`);
                    
                    const finalEntry = formatAgentMessage(
                      agentId,
                      agentOutput.name,
                      agentOutput.content,
                      iterationCounter,
                      'response'
                    );
                    
                    if (agentLogStore && jobId) {
                      agentLogStore.addLogEntry(jobId, finalEntry);
                      agentOutput.isSent = true; // 送信済みとしてマーク
                    }
                    
                    conversationHistory.push(finalEntry);
                  }
                }
              }
            }
            
            // イベントカウントのサマリーを出力
            console.log('📊 イベントカウントサマリー:', eventCounts);
            console.log(`📊 エージェント出力の状態:`, {
              agentOutputsSize: agentOutputs.size,
              agentOutputs: Array.from(agentOutputs.entries()).map(([id, output]) => ({
                id,
                name: output.name,
                contentLength: output.content.length,
                lastSentLength: output.lastSentLength
              }))
            });
            
            // ワークフロー状態を取得
            if (streamResult.getWorkflowState) {
              const state = await streamResult.getWorkflowState();
              if (state?.result) {
                result = state.result;
              }
            }
          } else {
            console.warn('⚠️ ストリームオブジェクトが見つかりません。通常のloopメソッドにフォールバック');
            // フォールバック: 通常のloopメソッドを使用
            result = await agentNetwork.loop(networkPrompt, networkOptions);
          }
        } else {
          console.log('📌 loopStreamメソッドが存在しません。通常のloopメソッドを使用');
          // 通常のloopメソッドを使用
          result = await agentNetwork.loop(networkPrompt, networkOptions);
          
          // メモリから会話履歴を取得（フォールバック）
          if (memory && memoryConfig && agentLogStore) {
            try {
              console.log(`📜 メモリから会話履歴を取得中（フォールバック）...`);
              const messages = await memory.getMessages({
                resourceId: memoryConfig.resource,
                threadId: memoryConfig.thread,
              });
              
              console.log(`📜 取得したメッセージ数: ${messages.length}`);
              
              messages.forEach((msg: any, index: number) => {
                let agentId = 'system';
                let agentName = 'System';
                
                if (msg.content) {
                  const content = msg.content.toLowerCase();
                  if (content.includes('ceo') || content.includes('strategic')) {
                    agentId = 'ceo';
                    agentName = 'CEO Agent';
                  } else if (content.includes('manager') || content.includes('plan')) {
                    agentId = 'manager';
                    agentName = 'Manager Agent';
                  } else if (content.includes('worker') || content.includes('execute')) {
                    agentId = 'worker';
                    agentName = 'Worker Agent';
                  }
                }
                
                const conversationEntry = formatAgentMessage(
                  agentId,
                  agentName,
                  msg.content || '',
                  index + 1,
                  msg.role === 'user' ? 'request' : 'response'
                );
                
                agentLogStore.addLogEntry(jobId, conversationEntry);
                conversationHistory.push(conversationEntry);
              });
              
              console.log(`✅ ${messages.length}件のメッセージをログストアに送信しました`);
            } catch (error) {
              console.error('❌ メモリから会話履歴の取得エラー:', error);
            }
          }
        }
        
        console.log(`🎯 NewAgentNetwork実行完了`);
        console.log(`🎯 会話履歴数:`, conversationHistory.length);
        
      } catch (error) {
        console.error('❌ NewAgentNetwork実行エラー:', error);
        throw error;
      }
      
      const networkExecutionTime = Date.now() - networkStartTime;
      console.log(`⏱️ ネットワーク実行時間: ${(networkExecutionTime / 1000).toFixed(2)}秒`);
      
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('✅ エージェントネットワーク実行完了:', {
        taskType: inputData.taskType,
        executionTime: `${executionTime}s`,
      });
      
      // 実行サマリーを作成
      const executionSummary = {
        totalIterations: conversationHistory.length || 3,
        agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
        executionTime: `${executionTime}s`,
      };
      
      // ログストアのジョブを完了としてマーク
      if (agentLogStore && jobId) {
        agentLogStore.completeJob(jobId, executionSummary);
      }
      
      // 結果を整形
      return {
        success: true,
        taskType: inputData.taskType,
        result: result?.result?.text || result?.text || result,
        executionSummary,
        conversationHistory,
      };

    } catch (error) {
      console.error('❌ エージェントネットワークエラー:', error);
      
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);

      // ログストアのジョブを失敗としてマーク
      if (agentLogStore && jobId) {
        agentLogStore.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
      }

      return {
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
    }
  },
});

// ワークフローを作成
export const agentNetworkWorkflow = createWorkflow({
  id: 'agent-network-workflow',
  description: 'Executes any task through a hierarchical CEO-Manager-Worker agent network',
  inputSchema,
  outputSchema,
})
  .then(agentNetworkStep)
  .commit();

// ワークフローをデフォルトエクスポート
export default agentNetworkWorkflow;