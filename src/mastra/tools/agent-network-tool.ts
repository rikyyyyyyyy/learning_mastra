import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { MastraMemory } from '@mastra/core/memory';
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

    // エージェントを取得
    const ceoAgent = mastraTyped.getAgent('ceo-agent');
    const managerAgent = mastraTyped.getAgent('manager-agent');
    const workerAgent = mastraTyped.getAgent('worker-agent');

    if (!ceoAgent || !managerAgent || !workerAgent) {
      throw new Error('必要なエージェントが見つかりません');
    }

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
      instructions: `Coordinate task execution through CEO-Manager-Worker hierarchy. The network automatically routes between agents based on the conversation flow.`,
      model: anthropic('claude-sonnet-4-20250514'),
      agents: {
        'ceo': ceoAgent as Agent,
        'manager': managerAgent as Agent,
        'worker': workerAgent as Agent,
      },
      defaultAgent: ceoAgent as Agent,
      // memoryはDynamicArgument型（関数）を要求される環境があるため、関数ラッパをanyで適合させる
      memory: (memory ? (((_args: any) => memory) as any) : undefined),
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
    
    let result;
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
            result = chunk.data || chunk.result;
            
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
              const output = (chunk as any).payload?.output;
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
              const data: any = (chunk as any).data || chunk;
              const content: string | undefined = data?.content || data?.text;
              if (content) {
                let agentId = 'system';
                let agentName = 'System';
                const raw = String(data?.agentId || data?.name || '').toLowerCase();
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
            const g = guessFrom(chunk.name) || guessFrom(chunk.toolName) || guessFrom((chunk.result as any)?.resourceId);
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
            result = state.result;
          }
        }
      }
    } else {
      // 通常のloopメソッドを使用
      console.log('📌 通常のloopメソッドを使用');
      result = await agentNetwork.loop(networkPrompt, networkOptions);
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
    
    // 結果を整形
    let finalResult = result?.result?.text || result?.text || result;
    
    // スライド生成タスクの特別処理
    if (inputData.taskType === 'slide-generation') {
      const workerResponse = conversationHistory.find(entry => 
        entry.agentId === 'worker' && 
        entry.message.includes('<!DOCTYPE html>')
      );
      
      if (workerResponse) {
        let htmlCode = workerResponse.message;
        
        // HTMLコードが途中で切れている場合の対処
        if (!htmlCode.includes('</html>')) {
          console.warn('⚠️ HTMLコードが途中で切れています。補完を試みます。');
          
          if (!htmlCode.includes('class="navigation"')) {
            const navigationHtml = `
        <div class="navigation">
            <button class="nav-btn" onclick="previousSlide()">← 前へ</button>
            <button class="nav-btn" onclick="nextSlide()">次へ →</button>
        </div>
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        
        document.getElementById('total-slides').textContent = totalSlides;
        
        function showSlide(n) {
            slides[currentSlide].classList.remove('active');
            currentSlide = (n + totalSlides) % totalSlides;
            slides[currentSlide].classList.add('active');
            document.getElementById('current-slide').textContent = currentSlide + 1;
        }
        
        function nextSlide() {
            showSlide(currentSlide + 1);
        }
        
        function previousSlide() {
            showSlide(currentSlide - 1);
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight') nextSlide();
            if (e.key === 'ArrowLeft') previousSlide();
        });
    </script>
</body>
</html>`;
            htmlCode += navigationHtml;
          } else {
            htmlCode += '\n</body>\n</html>';
          }
        }
        
        finalResult = {
          htmlCode: htmlCode,
          topic: (inputData.taskParameters as { topic?: string })?.topic || 'Untitled',
          slideCount: (inputData.taskParameters as { pages?: number; slideCount?: number })?.pages || 
                      (inputData.taskParameters as { pages?: number; slideCount?: number })?.slideCount || 10,
          style: (inputData.taskParameters as { style?: string })?.style || 'modern',
          generationTime: Date.now() - startTime
        };
      }
    }
    
    const outputData = {
      success: true,
      taskType: inputData.taskType,
      result: finalResult,
      executionSummary,
      conversationHistory,
    };

    console.log('✅ エージェントネットワーク実行完了:', {
      jobId,
      taskType: inputData.taskType,
      executionTime: `${executionTime}s`,
      timestamp: new Date().toISOString()
    });

    // 結果を保存
    updateJobStatus(jobId, 'completed');
    storeJobResult(jobId, outputData, 'agent-network');
    console.log('💾 ジョブ結果を保存しました:', jobId);

  } catch (error) {
    console.error('❌ エージェントネットワークエラー:', error);
    
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);
    
    // ログストアのジョブを失敗としてマーク
    agentLogStore.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
    
    // エラー時もステータスを保存
    updateJobStatus(jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    const outputData = {
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
    
    storeJobResult(jobId, outputData, 'agent-network');
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