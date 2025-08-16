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
// タスクタイプ別の最終成果物スキーマ
const SlideGenerationFinalResultSchema = z.object({
  htmlCode: z.string().min(1, 'htmlCode is required and must be non-empty'),
  topic: z.string().optional(),
  slideCount: z.number().int().positive().optional(),
  style: z.string().optional(),
  generationTime: z.union([z.string(), z.number()]).optional(),
}).describe('Final result for slide-generation task');

export const finalResultTool = createTool({
  id: 'final-result-save',
  description: 'Generate and save the final result of the entire network task after consolidating sub-task results (CEO Agent only)',
  inputSchema: z.object({
    networkId: z.string().describe('The network ID (same as jobId)'),
    taskType: z.enum(['web-search', 'slide-generation', 'weather', 'other']).describe('Type of the overall task'),
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
  }).superRefine((obj, ctx) => {
    if (obj.taskType === 'slide-generation') {
      const result = SlideGenerationFinalResultSchema.safeParse(obj.finalResult);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid finalResult for slide-generation: ${issue.message}`,
            path: ['finalResult', ...(issue.path ?? [])],
          });
        }
      }
    }
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
        workflowId: 'workflow',
        status: 'completed',
        result: {
          success: true,
          taskType: taskType,
          result: finalResult,
          // 標準化された成果物フィールド（generalやUIでの参照用）
          artifact: finalResult,
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
      
      // DBにも結果を保存し、ステータス更新
      try {
        const { updateJobStatus, storeJobResult } = await import('../../tools/job-status-tool');
        await storeJobResult(networkId, jobResult.result, 'workflow');
        await updateJobStatus(networkId, 'completed', { result: jobResult.result });
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