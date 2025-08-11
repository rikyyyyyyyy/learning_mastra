import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// ジョブ結果を保存するディレクトリ
const JOB_RESULTS_DIR = path.join(process.cwd(), '.job-results');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(JOB_RESULTS_DIR)) {
  fs.mkdirSync(JOB_RESULTS_DIR, { recursive: true });
}

/**
 * CEOエージェント専用ツール
 * ネットワーク全体の最終成果物を生成・保存
 */
export const finalResultTool = createTool({
  id: 'final-result-save',
  description: 'Generate and save the final result of the entire network task after consolidating sub-task results (CEO Agent only)',
  inputSchema: z.object({
    networkId: z.string().describe('The network ID (same as jobId)'),
    taskType: z.string().describe('Type of the overall task'),
    finalResult: z.any().describe('The consolidated final result/output of the network'),
    metadata: z.object({
      totalIterations: z.number().optional(),
      agentsInvolved: z.array(z.string()).optional(),
      executionTime: z.string().optional(),
      subTasksSummary: z.array(z.object({
        stepNumber: z.number().optional(),
        taskType: z.string(),
        description: z.string(),
        completed: z.boolean(),
      })).optional(),
    }).optional().describe('Additional metadata about the execution'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    savedPath: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { networkId, taskType, finalResult, metadata } = context;
    
    try {
      // 最終結果オブジェクトを構築
      const jobResult = {
        jobId: networkId,
        workflowId: 'agent-network', // 互換性のため
        status: 'completed',
        result: {
          success: true,
          taskType: taskType,
          result: finalResult,
          executionSummary: {
            totalIterations: metadata?.totalIterations || 0,
            agentsInvolved: metadata?.agentsInvolved || ['ceo-agent', 'manager-agent', 'worker-agent'],
            executionTime: metadata?.executionTime || 'unknown',
          },
          subTasksSummary: metadata?.subTasksSummary || [],
        },
        completedAt: new Date().toISOString(),
      };
      
      // ファイルパスを生成
      const filePath = path.join(JOB_RESULTS_DIR, `${networkId}.json`);
      
      // JSONファイルとして保存
      fs.writeFileSync(filePath, JSON.stringify(jobResult, null, 2));
      
      console.log(`✅ 最終成果物を保存しました: ${filePath}`);
      console.log(`📦 保存された内容:`, JSON.stringify(jobResult, null, 2));
      
      // job-status-toolのステータスも更新するため、動的インポート
      try {
        const { updateJobStatus } = await import('../../tools/job-status-tool');
        updateJobStatus(networkId, 'completed', { result: jobResult.result });
      } catch (error) {
        console.warn('⚠️ ジョブステータスの更新に失敗（処理は継続）:', error);
      }
      
      return {
        success: true,
        message: `Successfully saved final result for network ${networkId}`,
        savedPath: filePath,
      };
    } catch (error) {
      console.error('❌ 最終成果物の保存エラー:', error);
      
      // エラー時のジョブステータス更新
      try {
        const { updateJobStatus } = await import('../../tools/job-status-tool');
        updateJobStatus(networkId, 'failed', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      } catch (statusError) {
        console.warn('⚠️ エラーステータスの更新に失敗:', statusError);
      }
      
      return {
        success: false,
        message: `Failed to save final result: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});