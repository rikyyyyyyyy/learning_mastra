import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { NewAgentNetwork } from '@mastra/core/network/vNext';
import { anthropic } from '@ai-sdk/anthropic';

// 入力スキーマ
const inputSchema = z.object({
  taskType: z.string(),
  taskDescription: z.string(),
  taskParameters: z.any(),
  context: z.object({
    priority: z.enum(['low', 'medium', 'high']).optional(),
    constraints: z.any().optional(),
    expectedOutput: z.string().optional(),
    additionalInstructions: z.string().optional(),
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
    
    try {
      console.log('🌐 エージェントネットワークワークフロー開始:', {
        taskType: inputData.taskType,
        hasRuntimeContext: !!runtimeContext,
        timestamp: new Date().toISOString(),
      });

      // Mastraインスタンスが利用可能か確認
      if (!mastra) {
        throw new Error('Mastraインスタンスが利用できません');
      }

      // エージェントを取得
      const ceoAgent = mastra.getAgent('ceo-agent');
      const managerAgent = mastra.getAgent('manager-agent');
      const workerAgent = mastra.getAgent('worker-agent');

      if (!ceoAgent || !managerAgent || !workerAgent) {
        throw new Error('必要なエージェントが見つかりません');
      }

      // メモリ設定を準備
      const resourceId = runtimeContext?.get('resourceId') as string | undefined;
      const threadId = runtimeContext?.get('threadId') as string | undefined;
      const memoryConfig = resourceId && threadId ? {
        resource: resourceId,
        thread: threadId,
      } : undefined;

      // エージェントネットワークを作成
      const agentNetwork = new NewAgentNetwork({
        id: 'task-execution-network',
        name: 'Task Execution Network',
        instructions: 'Coordinate task execution through CEO-Manager-Worker hierarchy',
        model: anthropic('claude-3-5-sonnet-latest'),
        agents: {
          'ceo': ceoAgent,
          'manager': managerAgent,
          'worker': workerAgent,
        },
        defaultAgent: ceoAgent,
        memory: memoryConfig ? mastra?.getMemory() : undefined,
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

As the CEO agent, analyze this task and delegate appropriately to achieve the best result.
`;

      console.log('🎯 ネットワークプロンプト:', networkPrompt);

      // エージェントネットワークを実行
      const result = await agentNetwork.loop(
        networkPrompt,
        {
          maxIterations: 10, // 最大10回のエージェント間やり取り
        }
      );

      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);

      console.log('✅ エージェントネットワーク実行完了:', {
        taskType: inputData.taskType,
        iteration: result.result?.iteration || 1,
        executionTime: `${executionTime}s`,
      });

      // 結果を整形
      return {
        success: true,
        taskType: inputData.taskType,
        result: result.result?.text || result,
        executionSummary: {
          totalIterations: result.result?.iteration || 1,
          agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
          executionTime: `${executionTime}s`,
        },
      };

    } catch (error) {
      console.error('❌ エージェントネットワークエラー:', error);
      
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(2);

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