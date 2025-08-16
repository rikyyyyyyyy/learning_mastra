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
    // 正規化済みフィールド（LLMがそのまま提示できるように）
    success: z.boolean().optional(),
    taskType: z.string().optional(),
    artifactText: z.string().optional(),
    artifactHtml: z.string().optional(),
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
    
    // 正規化: 最終成果物（artifact）を抽出
    // 期待構造: jobResult.result = { success, taskType, result, artifact?, executionSummary?, ... }
    const r = jobResult.result as Record<string, unknown> | null;
    const normalized: {
      success?: boolean;
      taskType?: string;
      artifactText?: string;
      artifactHtml?: string;
    } = {};

    if (r && typeof r === 'object') {
      if (typeof r['success'] === 'boolean') normalized.success = r['success'] as boolean;
      if (typeof r['taskType'] === 'string') normalized.taskType = r['taskType'] as string;
      const artifact = (r['artifact'] as unknown) as Record<string, unknown> | string | undefined;
      if (artifact) {
        if (typeof artifact === 'string') {
          normalized.artifactText = artifact;
        } else if (typeof artifact === 'object') {
          if (typeof artifact['htmlCode'] === 'string') normalized.artifactHtml = artifact['htmlCode'] as string;
          if (typeof artifact['text'] === 'string') normalized.artifactText = artifact['text'] as string;
        }
      } else {
        // 後方互換: resultフィールドに直接テキスト/HTMLを入れていた場合
        const inner = (r['result'] as unknown) as Record<string, unknown> | string | undefined;
        if (inner) {
          if (typeof inner === 'string') {
            normalized.artifactText = inner;
          } else if (typeof inner === 'object') {
            if (typeof inner['htmlCode'] === 'string') normalized.artifactHtml = inner['htmlCode'] as string;
            if (typeof inner['text'] === 'string') normalized.artifactText = inner['text'] as string;
          }
        }
      }
    }

    return {
      jobId,
      found: true,
      result: jobResult.result,
      ...normalized,
      completedAt: jobResult.completedAt.toISOString(),
      workflowId: jobResult.workflowId ?? 'unknown',
      message: `ジョブID「${jobId}」の結果を正常に取得しました。`,
    };
  },
}); 