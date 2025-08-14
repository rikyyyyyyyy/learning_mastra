import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getJobResult } from './job-status-tool';

export const jobResultTool = createTool({
  id: 'job-result-fetch',
  description: 'ジョブIDを指定してワークフロー実行結果を取得します。完了したジョブの詳細な結果データを取得できます。',
  inputSchema: z.object({
    jobId: z.string().describe('結果を取得したいジョブID'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    found: z.boolean(),
    result: z.any().optional(),
    completedAt: z.string().optional(),
    workflowId: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    
    const jobResult = await getJobResult(jobId);
    
    if (!jobResult) {
      return {
        jobId,
        found: false,
        message: `ジョブID「${jobId}」の結果は見つかりませんでした。ジョブが完了していないか、存在しない可能性があります。`,
      };
    }
    
    return {
      jobId,
      found: true,
      result: jobResult.result,
      completedAt: jobResult.completedAt.toISOString(),
      workflowId: jobResult.workflowId,
      message: `ジョブID「${jobId}」の結果を正常に取得しました。`,
    };
  },
}); 