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
    const jobResult = getJobResult(jobId);
    
    if (!jobResult) {
      return {
        jobId,
        previewReady: false,
        message: `ジョブID「${jobId}」の結果が見つかりません。スライド生成が完了していない可能性があります。`,
      };
    }
    
    // ワークフローがagent-networkでない場合
    if (jobResult.workflowId !== 'agent-network') {
      return {
        jobId,
        previewReady: false,
        message: `ジョブID「${jobId}」はスライド生成ジョブではありません。`,
      };
    }
    
    // スライド生成結果の存在確認
    let slideResult = jobResult.result;
    
    // agent-networkツールの場合、結果の構造が異なる
    if (jobResult.workflowId === 'agent-network' && 
        slideResult && typeof slideResult === 'object' && 
        'taskType' in slideResult) {
      const networkOutput = slideResult as { taskType?: string; result?: unknown };
      
      // タスクタイプがslide-generationであることを確認
      if (networkOutput?.taskType !== 'slide-generation') {
        return {
          jobId,
          previewReady: false,
          message: `ジョブID「${jobId}」はスライド生成タスクではありません。`,
        };
      }
      
      // agent-networkツールの結果から実際のスライド結果を取得
      slideResult = networkOutput.result;
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