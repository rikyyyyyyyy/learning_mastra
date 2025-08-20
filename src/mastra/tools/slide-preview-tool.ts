import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getJobResult } from './job-status-tool';

export const slidePreviewTool = createTool({
  id: 'slide-preview-display',
  description: 'スライドプレビューを表示するためのトリガーツールです。このツールが実行されると、フロントエンドが自動的にスライドのプレビューを表示します。',
  inputSchema: z.object({
    jobId: z.string().describe('プレビューしたいスライド生成ジョブのID'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    previewReady: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    
    console.log(`🖼️ スライドプレビュートリガー実行 (jobId: ${jobId})`);
    
    // ジョブ結果の存在確認のみ行う
    const jobResult = await getJobResult(jobId);
    
    if (!jobResult) {
      return {
        jobId,
        previewReady: false,
        message: `ジョブID「${jobId}」の結果が見つかりません。スライド生成が完了していない可能性があります。`,
      };
    }
    
    const workflowId = jobResult.workflowId;
    let slideResult: unknown = undefined;
    
    // ケース1: agent-network の結果
    if (workflowId === 'agent-network') {
      const networkOutput = jobResult.result as { taskType?: string; result?: unknown } | undefined;
      if (networkOutput && typeof networkOutput === 'object') {
        if (networkOutput.taskType !== 'slide-generation') {
          return {
            jobId,
            previewReady: false,
            message: `ジョブID「${jobId}」はスライド生成タスクではありません。`,
          };
        }
        slideResult = (networkOutput as { result?: unknown }).result;
      }
    }
    
    // ケース2: CEO-Manager-Worker ワークフロー（最終成果物保存ツール経由）
    // finalResultTool により jobResult.result は { success, taskType, result, artifact, ... }
    if (!slideResult && workflowId === 'workflow') {
      const container = jobResult.result as { taskType?: string; result?: unknown; artifact?: unknown } | undefined;
      if (container && typeof container === 'object') {
        if (container.taskType !== 'slide-generation') {
          return {
            jobId,
            previewReady: false,
            message: `ジョブID「${jobId}」はスライド生成タスクではありません。`,
          };
        }
        slideResult = (container.artifact ?? container.result) as unknown;
      }
    }
    
    // ケース3: スライド生成専用ワークフロー（結果が直接 htmlCode を含む）
    if (!slideResult && (workflowId === 'slideGenerationWorkflow' || workflowId === 'slide-generation-workflow')) {
      slideResult = jobResult.result as unknown;
    }
    
    // フォールバック: 形状に依存せず htmlCode を可能な限り抽出
    if (!slideResult) {
      const maybeUnknown = jobResult.result as unknown;
      if (typeof maybeUnknown === 'object' && maybeUnknown !== null) {
        const maybe = maybeUnknown as Record<string, unknown>;
        const htmlCodeDirect = maybe.htmlCode;
        const nestedResult = maybe.result as unknown;
        const nestedArtifact = maybe.artifact as unknown;

        if (typeof htmlCodeDirect === 'string' && htmlCodeDirect) {
          slideResult = maybe as { htmlCode: string };
        } else if (
          typeof nestedResult === 'object' &&
          nestedResult !== null &&
          typeof (nestedResult as Record<string, unknown>).htmlCode === 'string' &&
          (nestedResult as Record<string, unknown>).htmlCode
        ) {
          slideResult = nestedResult as { htmlCode: string };
        } else if (
          typeof nestedArtifact === 'object' &&
          nestedArtifact !== null &&
          typeof (nestedArtifact as Record<string, unknown>).htmlCode === 'string' &&
          (nestedArtifact as Record<string, unknown>).htmlCode
        ) {
          slideResult = nestedArtifact as { htmlCode: string };
        }
      }
    }
    
    if (!slideResult || typeof slideResult !== 'object' || 
        !('htmlCode' in slideResult) || !slideResult.htmlCode) {
      return {
        jobId,
        previewReady: false,
        message: `ジョブID「${jobId}」のスライドHTMLコードが見つかりません。`,
      };
    }
    
    console.log(`✅ スライドプレビュー準備完了 (jobId: ${jobId})`);
    
    // トリガーとしての役割のみなので、HTMLコードは返さない
    return {
      jobId,
      previewReady: true,
      message: `スライドプレビューの準備が完了しました。プレビューが自動的に表示されます。`,
    };
  },
}); 