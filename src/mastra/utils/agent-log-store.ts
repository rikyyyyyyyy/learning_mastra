import { EventEmitter } from 'events';

// エージェント会話エントリの型定義
export interface AgentConversationEntry {
  agentId: string;
  agentName: string;
  message: string;
  timestamp: string;
  iteration: number;
  messageType?: 'request' | 'response' | 'internal';
  metadata?: {
    model?: string;
    tools?: string[];
    tokenCount?: number;
    executionTime?: number;
  };
}

// ジョブログの型定義
export interface JobLog {
  jobId: string;
  taskType: string;
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  conversationHistory: AgentConversationEntry[];
  executionSummary?: {
    totalIterations?: number;
    agentsInvolved?: string[];
    executionTime?: string;
  };
}

// イベントの型定義
export interface LogStoreEvents {
  'log-added': (jobId: string, entry: AgentConversationEntry) => void;
  'job-created': (jobId: string, taskType: string) => void;
  'job-completed': (jobId: string) => void;
  'job-failed': (jobId: string, error: string) => void;
}

// エージェントログストアクラス
class AgentLogStore extends EventEmitter {
  private logs: Map<string, JobLog> = new Map();
  private maxLogsPerJob = 1000; // ジョブあたりの最大ログ数
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    
    // 定期的に古いログをクリーンアップ（1時間ごと）
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  // ジョブの作成
  createJob(jobId: string, taskType: string): void {
    if (this.logs.has(jobId)) {
      console.warn(`Job ${jobId} already exists`);
      return;
    }

    const jobLog: JobLog = {
      jobId,
      taskType,
      status: 'running',
      startTime: new Date().toISOString(),
      conversationHistory: [],
    };

    this.logs.set(jobId, jobLog);
    this.emit('job-created', jobId, taskType);
    console.log(`📝 ジョブ作成: ${jobId} (${taskType})`);
  }

  // ログエントリの追加
  addLogEntry(jobId: string, entry: AgentConversationEntry): void {
    const jobLog = this.logs.get(jobId);
    if (!jobLog) {
      console.error(`❌ [AgentLogStore] Job ${jobId} not found`);
      console.error(`❌ [AgentLogStore] 現在のジョブ一覧:`, Array.from(this.logs.keys()));
      return;
    }

    if (jobLog.status !== 'running') {
      console.warn(`⚠️ [AgentLogStore] Job ${jobId} is not running (status: ${jobLog.status})`);
      return;
    }

    // ログ数の制限
    if (jobLog.conversationHistory.length >= this.maxLogsPerJob) {
      console.warn(`⚠️ [AgentLogStore] Job ${jobId} has reached max log entries`);
      return;
    }

    jobLog.conversationHistory.push(entry);
    
    // イベントリスナーの状態を確認
    const listenerCount = this.listenerCount('log-added');
    console.log(`📤 [AgentLogStore] ログ追加: ${jobId} - ${entry.agentName}: ${entry.message.substring(0, 50)}... (リスナー数: ${listenerCount})`);
    
    this.emit('log-added', jobId, entry);
  }

  // 複数のログエントリを一度に追加
  addLogEntries(jobId: string, entries: AgentConversationEntry[]): void {
    entries.forEach(entry => this.addLogEntry(jobId, entry));
  }

  // ジョブの完了
  completeJob(jobId: string, executionSummary?: JobLog['executionSummary']): void {
    const jobLog = this.logs.get(jobId);
    if (!jobLog) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    jobLog.status = 'completed';
    jobLog.endTime = new Date().toISOString();
    if (executionSummary) {
      jobLog.executionSummary = executionSummary;
    }

    this.emit('job-completed', jobId);
    console.log(`✅ ジョブ完了: ${jobId}`);
  }

  // ジョブの失敗
  failJob(jobId: string, error: string): void {
    const jobLog = this.logs.get(jobId);
    if (!jobLog) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    jobLog.status = 'failed';
    jobLog.endTime = new Date().toISOString();

    this.emit('job-failed', jobId, error);
    console.log(`❌ ジョブ失敗: ${jobId} - ${error}`);
  }

  // ジョブログの取得
  getJobLog(jobId: string): JobLog | undefined {
    return this.logs.get(jobId);
  }

  // 実行中のジョブ一覧を取得
  getRunningJobs(): string[] {
    return Array.from(this.logs.entries())
      .filter(([, log]) => log.status === 'running')
      .map(([jobId]) => jobId);
  }

  // すべてのジョブを取得
  getAllJobs(): Map<string, JobLog> {
    return new Map(this.logs);
  }

  // 特定のジョブのログをクリア
  clearJob(jobId: string): void {
    this.logs.delete(jobId);
    console.log(`🗑️ ジョブクリア: ${jobId}`);
  }

  // 古いログのクリーンアップ（24時間以上前のもの）
  private cleanup(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24時間

    for (const [jobId, log] of this.logs.entries()) {
      const endTime = log.endTime ? new Date(log.endTime) : null;
      const startTime = new Date(log.startTime);
      
      // 完了/失敗したジョブで24時間以上経過したもの
      if (endTime && now.getTime() - endTime.getTime() > maxAge) {
        this.clearJob(jobId);
        continue;
      }
      
      // 実行中でも48時間以上経過したもの（異常終了の可能性）
      if (!endTime && now.getTime() - startTime.getTime() > maxAge * 2) {
        this.failJob(jobId, 'Timeout - job running for too long');
        this.clearJob(jobId);
      }
    }
  }

  // クリーンアップの停止
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
    this.logs.clear();
  }
}

// シングルトンインスタンス
const agentLogStore = new AgentLogStore();
export { agentLogStore };

// ユーティリティ関数
export function formatAgentMessage(
  agentId: string, 
  agentName: string, 
  message: string, 
  iteration: number,
  messageType?: 'request' | 'response' | 'internal',
  metadata?: AgentConversationEntry['metadata']
): AgentConversationEntry {
  return {
    agentId,
    agentName,
    message,
    timestamp: new Date().toISOString(),
    iteration,
    messageType,
    metadata,
  };
}