import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { jobStore } from '../services/job-store';
import { ensureTaskDBInitialized } from '../task-management/db/init';

// fs依存を廃止し、DBベースのJobStoreに移行

// 互換のための型のみ維持

interface JobResult {
  jobId: string;
  result: unknown;
  completedAt: Date;
  workflowId: string;
}

// ワークフロー結果専用ストレージ（本番ではデータベースを使用）
// const jobResultStore = new Map<string, JobResult>();

export const jobStatusTool = createTool({
  id: 'job-status-check',
  description: 'ジョブIDを指定してジョブの実行状態を確認します',
  inputSchema: z.object({
    jobId: z.string().describe('確認したいジョブID'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'not_found']),
    message: z.string(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
  }),
  execute: async ({ context }) => {
    await ensureTaskDBInitialized();
    const { jobId } = context;
    
    // DB初期化遅延に対応
    const status = await jobStore.getStatus(jobId);
    
    if (!status) {
      return {
        jobId,
        status: 'not_found' as const,
        message: `ジョブID「${jobId}」は見つかりませんでした`,
      };
    }
    
    const response = {
      jobId,
      status: (['queued','running','completed','failed'] as const).includes(status.status as 'queued'|'running'|'completed'|'failed') ? (status.status as 'queued'|'running'|'completed'|'failed') : 'queued',
      message: getStatusMessage(status.status),
      result: undefined,
      error: status.error ?? undefined,
      startedAt: status.started_at ?? undefined,
      completedAt: status.completed_at ?? undefined,
    };
    
    return response;
  },
});

// ジョブ状態を更新する関数（他のツールから呼び出し可能）
export async function updateJobStatus(
  jobId: string, 
  status: 'queued' | 'running' | 'completed' | 'failed',
  options?: {
    result?: unknown;
    error?: string;
  }
) {
  await jobStore.updateStatus(jobId, status, { error: options?.error });
  console.log(`📊 ジョブ状態更新(DB): ${jobId} -> ${status}`);
}

// ジョブ状態を初期化する関数
export async function initializeJob(jobId: string) {
  await jobStore.initializeJob(jobId);
}

// ワークフロー結果を格納する関数（ファイルシステムに保存）
export async function storeJobResult(
  jobId: string,
  result: unknown,
  workflowId: string = 'unknown'
) {
  await jobStore.storeResult(jobId, result, workflowId);
}

// ワークフロー結果を取得する関数（DBまたはファイルシステムから読み込み）
export async function getJobResult(jobId: string): Promise<JobResult | null> {
  console.log(`🔍 ジョブ結果を検索(DB): ${jobId}`);
  
  // まずDBから取得を試みる
  const row = await jobStore.getResult(jobId);
  if (row) {
    return {
      jobId: row.job_id,
      result: row.result,
      completedAt: new Date(row.created_at),
      workflowId: row.workflow_id ?? 'unknown',
    };
  }
  
  // DBに無い場合はファイルシステムから読み込み
  console.log(`📂 DBに結果が無いため、ファイルシステムから検索: ${jobId}`);
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const jobResultsDir = path.join(process.cwd(), '.job-results');
    const filePath = path.join(jobResultsDir, `${jobId}.json`);
    
    // ファイルの存在確認
    await fs.access(filePath);
    
    // ファイルを読み込み
    const content = await fs.readFile(filePath, 'utf-8');
    const fileData = JSON.parse(content);
    
    console.log(`✅ ファイルシステムから結果を取得: ${jobId}`);
    
    // ファイルデータからJobResult形式に変換
    return {
      jobId: fileData.jobId || jobId,
      result: fileData.result,
      completedAt: fileData.completedAt ? new Date(fileData.completedAt) : new Date(),
      workflowId: fileData.workflowId || 'unknown',
    };
  } catch {
    console.log(`❌ ファイルシステムからも結果が見つかりません: ${jobId}`);
    return null;
  }
}

// 完了したジョブの一覧を取得する関数
export async function getCompletedJobs(): Promise<string[]> {
  try {
    return await jobStore.listCompletedJobs(100);
  } catch (error) {
    console.error(`❌ ジョブ一覧の取得エラー(DB): ${error}`);
    return [];
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'queued':
      return 'ジョブは実行待ちです';
    case 'running':
      return 'ジョブを実行中です';
    case 'completed':
      return 'ジョブが正常に完了しました';
    case 'failed':
      return 'ジョブの実行に失敗しました';
    default:
      return '不明な状態です';
  }
} 