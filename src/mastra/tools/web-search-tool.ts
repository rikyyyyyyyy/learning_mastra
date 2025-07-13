import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { initializeJob, updateJobStatus, storeJobResult } from './job-status-tool';

export const webSearchTool = createTool({
  id: 'web-search-queue',
  description: 'Web検索ジョブをキューに登録し、jobIdを即座に返します。実際の検索処理はワークフローで非同期実行されます。',
  inputSchema: z.object({
    query: z.string().describe('検索クエリ'),
    maxResults: z.number().describe('最大検索結果数'),
    language: z.string().describe('検索言語'),
  }),
  outputSchema: z.object({
    jobId: z.string().describe('ジョブID'),
    status: z.literal('queued').describe('ジョブステータス'),
    message: z.string().describe('ステータスメッセージ'),
    estimatedTime: z.string().describe('推定完了時間'),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { query, maxResults = 5, language = 'ja' } = context;
    
    // ジョブIDを生成（タイムスタンプ + ランダム文字列）
    const jobId = `web-search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // ジョブ状態を初期化
    initializeJob(jobId);
    
    // 高速レスポンスのために即座にjobIdを返す
    const response = {
      jobId,
      status: 'queued' as const,
      message: `Web検索ジョブ「${query}」をキューに登録しました`,
      estimatedTime: '30-60秒程度',
    };
    
    // バックグラウンドでワークフローを非同期実行
    // 遅延読み込みでMastraインスタンスを取得
    setTimeout(() => {
      import('../index').then(({ mastra: mastraInstance }) => {
        if (mastraInstance) {
          executeWorkflowInBackground(mastraInstance, jobId, { query, maxResults, language }, runtimeContext)
            .catch(error => {
              console.error(`ワークフロー実行エラー (jobId: ${jobId}):`, error);
            });
        } else {
          console.error(`Mastraインスタンスが利用できません (jobId: ${jobId})`);
          updateJobStatus(jobId, 'failed', { error: 'Mastraインスタンスが利用できません' });
        }
      }).catch(error => {
        console.error(`Mastraインスタンス読み込みエラー (jobId: ${jobId}):`, error);
        updateJobStatus(jobId, 'failed', { error: 'Mastraインスタンスの読み込みに失敗しました' });
      });
    }, 0);
    
    return response;
  },
});

// バックグラウンドでワークフローを実行する関数
async function executeWorkflowInBackground(
  mastra: unknown, 
  jobId: string, 
  inputData: { query: string; maxResults?: number; language?: string },
  runtimeContext?: unknown
) {
  try {
    console.log(`🚀 ワークフロー開始 (jobId: ${jobId})`);
    updateJobStatus(jobId, 'running');
    
    const mastraInstance = mastra as { getWorkflow: (id: string) => unknown };
    const workflow = mastraInstance.getWorkflow('webSearchWorkflow');
    if (!workflow) {
      throw new Error('webSearchWorkflowが見つかりません');
    }

    const workflowInstance = workflow as { 
      createRunAsync: (options: { runId: string }) => Promise<{
        watch: (callback: (event: { type: string; payload?: { id?: string } }) => void) => void;
        start: (options: { inputData: unknown; runtimeContext?: unknown }) => Promise<{
          status: 'success' | 'failed' | 'suspended';
          result?: unknown;
          error?: { message?: string };
          suspended?: unknown;
        }>;
      }>
    };
    const run = await workflowInstance.createRunAsync({ runId: jobId });
    
    // 進捗監視を設定
    run.watch((event: { type: string; payload?: { id?: string } }) => {
      console.log(`📊 ワークフロー進捗 (${jobId}):`, event.type, event.payload?.id || '');
    });
    
    // ワークフローを実行（runtimeContextを渡す）
    const result = await run.start({ 
      inputData,
      runtimeContext 
    });
    
    if (result.status === 'success') {
      console.log(`✅ ワークフロー完了 (jobId: ${jobId})`);
      const searchResult = result.result as { metadata?: { completedAt?: string } } | undefined;
      console.log(`📝 レポート生成完了: ${searchResult?.metadata?.completedAt}`);
      
      // ジョブ状態を更新
      updateJobStatus(jobId, 'completed', { result: result.result });
      
      // ワークフロー結果を専用ストレージに格納
      storeJobResult(jobId, result.result, 'webSearchWorkflow');
      
    } else if (result.status === 'failed') {
      console.error(`❌ ワークフロー失敗 (jobId: ${jobId}):`, result.error);
      updateJobStatus(jobId, 'failed', { error: result.error?.message || 'Unknown error' });
      
    } else if (result.status === 'suspended') {
      console.log(`⏸️ ワークフロー中断 (jobId: ${jobId}):`, result.suspended);
      // 中断状態は特別な処理が必要な場合があるため、ここでは状態を更新しない
      
    }
    
  } catch (error) {
    console.error(`💥 ワークフロー実行中の致命的エラー (jobId: ${jobId}):`, error);
    updateJobStatus(jobId, 'failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
} 