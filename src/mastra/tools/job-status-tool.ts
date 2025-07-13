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

interface JobStatus {
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// 簡易的なジョブ状態管理（実際のプロダクションではデータベースを使用）
const jobStatusStore = new Map<string, JobStatus>();

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
    result: z.any().optional(),
    error: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    
    const jobInfo = jobStatusStore.get(jobId);
    
    if (!jobInfo) {
      return {
        jobId,
        status: 'not_found' as const,
        message: `ジョブID「${jobId}」は見つかりませんでした`,
      };
    }
    
    const response = {
      jobId,
      status: jobInfo.status,
      message: getStatusMessage(jobInfo.status),
      result: jobInfo.result,
      error: jobInfo.error,
      startedAt: jobInfo.startedAt?.toISOString(),
      completedAt: jobInfo.completedAt?.toISOString(),
    };
    
    return response;
  },
});

// ジョブ状態を更新する関数（他のツールから呼び出し可能）
export function updateJobStatus(
  jobId: string, 
  status: 'queued' | 'running' | 'completed' | 'failed',
  options?: {
    result?: unknown;
    error?: string;
  }
) {
  const existing = jobStatusStore.get(jobId) || { status: 'queued' };
  
  const updated: JobStatus = {
    ...existing,
    status,
    ...(options?.result ? { result: options.result } : {}),
    ...(options?.error ? { error: options.error } : {}),
    ...(status === 'running' && !existing.startedAt ? { startedAt: new Date() } : {}),
    ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
  };
  
  jobStatusStore.set(jobId, updated);
  console.log(`📊 ジョブ状態更新: ${jobId} -> ${status}`);
}

// ジョブ状態を初期化する関数
export function initializeJob(jobId: string) {
  jobStatusStore.set(jobId, {
    status: 'queued',
    startedAt: new Date(),
  });
}

// ワークフロー結果を格納する関数（ファイルシステムに保存）
export function storeJobResult(
  jobId: string,
  result: unknown,
  workflowId: string = 'unknown'
) {
  const jobResult = {
    jobId,
    result,
    completedAt: new Date().toISOString(),
    workflowId,
  };
  
  // ファイルに保存
  const filePath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(jobResult, null, 2));
    console.log(`💾 ジョブ結果をファイルに保存: ${filePath}`);
  } catch (error) {
    console.error(`❌ ジョブ結果の保存に失敗: ${error}`);
  }
}

// ワークフロー結果を取得する関数（ファイルシステムから読み込み）
export function getJobResult(jobId: string): JobResult | null {
  console.log(`🔍 ジョブ結果を検索: ${jobId}`);
  
  const filePath = path.join(JOB_RESULTS_DIR, `${jobId}.json`);
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const result = JSON.parse(data);
      console.log(`✅ ジョブ結果が見つかりました: ${jobId} (ファイル: ${filePath})`);
      // Date文字列をDateオブジェクトに変換
      result.completedAt = new Date(result.completedAt);
      return result;
    } else {
      console.log(`❌ ジョブ結果ファイルが見つかりません: ${filePath}`);
      // ディレクトリ内のファイル一覧を表示
      const files = fs.readdirSync(JOB_RESULTS_DIR);
      console.log(`📁 利用可能なジョブ結果: ${files.join(', ')}`);
    }
  } catch (error) {
    console.error(`❌ ジョブ結果の読み込みエラー: ${error}`);
  }
  
  return null;
}

// 完了したジョブの一覧を取得する関数
export function getCompletedJobs(): string[] {
  try {
    const files = fs.readdirSync(JOB_RESULTS_DIR);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  } catch (error) {
    console.error(`❌ ジョブ一覧の取得エラー: ${error}`);
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