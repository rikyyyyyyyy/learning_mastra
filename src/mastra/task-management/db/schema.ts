import { z } from 'zod';

// Task status enum
export const TaskStatus = z.enum(['queued', 'running', 'completed', 'failed', 'paused']);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Directive status enum  
export const DirectiveStatus = z.enum(['pending', 'acknowledged', 'applied', 'rejected']);
export type DirectiveStatus = z.infer<typeof DirectiveStatus>;

// Network task schema (拡張版)
export const NetworkTaskSchema = z.object({
  task_id: z.string(),
  network_id: z.string(), // どのネットワークで動いているか
  parent_job_id: z.string().optional(),
  network_type: z.string().default('CEO-Manager-Worker'),
  status: TaskStatus,
  task_type: z.string(),
  task_description: z.string(),
  task_parameters: z.any().optional(),
  task_result: z.any().optional(), // タスクの結果
  progress: z.number().min(0).max(100).default(0), // 進行状況（%）
  created_by: z.string(),
  assigned_to: z.string().optional(), // 担当Worker
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  step_number: z.number().optional(), // タスクのステップ番号
  depends_on: z.array(z.string()).optional(), // 依存タスクID
  execution_time: z.number().optional(), // 実行時間（ミリ秒）
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type NetworkTask = z.infer<typeof NetworkTaskSchema>;

// Network directive schema (追加指令DB)
export const NetworkDirectiveSchema = z.object({
  directive_id: z.string(),
  network_id: z.string(), // どのネットワークへの指令か
  directive_content: z.string(), // 追加指令の内容
  directive_type: z.enum(['policy_update', 'task_addition', 'priority_change', 'abort', 'other']).default('other'),
  source: z.string().default('general-agent'), // 指令の送信元
  status: DirectiveStatus,
  created_at: z.string(),
  updated_at: z.string(),
  acknowledged_at: z.string().optional(),
  applied_at: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type NetworkDirective = z.infer<typeof NetworkDirectiveSchema>;

// Content-Addressable Storage schemas
export const ContentStoreSchema = z.object({
  content_hash: z.string(), // SHA-256ハッシュ（主キー）
  content_type: z.string(), // 'text/html', 'application/json', 'text/markdown'
  content: z.string(), // Base64エンコードされたコンテンツ
  size: z.number(),
  created_at: z.string(),
  storage_location: z.string().optional(), // S3 URL等（将来用）
});

export type ContentStore = z.infer<typeof ContentStoreSchema>;

export const ContentChunkSchema = z.object({
  chunk_id: z.string(),
  content_hash: z.string(), // 所属するコンテンツ
  chunk_index: z.number(), // 順序
  chunk_data: z.string(), // Base64エンコードされた部分データ
  offset: z.number(), // バイトオフセット
  size: z.number(),
  created_at: z.string(),
});

export type ContentChunk = z.infer<typeof ContentChunkSchema>;

export const ArtifactSchema = z.object({
  artifact_id: z.string(), // UUID
  job_id: z.string(),
  task_id: z.string().optional(),
  current_revision: z.string(), // 最新リビジョンID
  mime_type: z.string(),
  labels: z.record(z.string()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactRevisionSchema = z.object({
  revision_id: z.string(), // UUID
  artifact_id: z.string(),
  content_hash: z.string(), // CASへの参照
  parent_revisions: z.array(z.string()).optional(), // 親リビジョン（マージ対応）
  commit_message: z.string(),
  author: z.string(), // agent-id
  created_at: z.string(),
  patch_from_parent: z.string().optional(), // 差分データ（最適化）
});

export type ArtifactRevision = z.infer<typeof ArtifactRevisionSchema>;

// SQL table creation statements
export const SQL_SCHEMAS = {
  network_tasks: `
    CREATE TABLE IF NOT EXISTS network_tasks (
      task_id TEXT PRIMARY KEY,
      network_id TEXT NOT NULL,
      parent_job_id TEXT,
      network_type TEXT DEFAULT 'CEO-Manager-Worker',
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'paused')),
      task_type TEXT NOT NULL,
      task_description TEXT NOT NULL,
      task_parameters TEXT,
      task_result TEXT,
      progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
      created_by TEXT NOT NULL,
      assigned_to TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      step_number INTEGER,
      depends_on TEXT,
      execution_time INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_network_tasks_status ON network_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_network_id ON network_tasks(network_id);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_parent_job ON network_tasks(parent_job_id);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_created_by ON network_tasks(created_by);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_assigned_to ON network_tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_step_number ON network_tasks(network_id, step_number);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_network_tasks_network_step
      ON network_tasks(network_id, step_number)
      WHERE step_number IS NOT NULL;
  `,
  
  network_directives: `
    CREATE TABLE IF NOT EXISTS network_directives (
      directive_id TEXT PRIMARY KEY,
      network_id TEXT NOT NULL,
      directive_content TEXT NOT NULL,
      directive_type TEXT DEFAULT 'other' CHECK(directive_type IN ('policy_update', 'task_addition', 'priority_change', 'abort', 'other')),
      source TEXT DEFAULT 'general-agent',
      status TEXT NOT NULL CHECK(status IN ('pending', 'acknowledged', 'applied', 'rejected')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      acknowledged_at TEXT,
      applied_at TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_network_directives_network_id ON network_directives(network_id);
    CREATE INDEX IF NOT EXISTS idx_network_directives_status ON network_directives(status);
    CREATE INDEX IF NOT EXISTS idx_network_directives_created_at ON network_directives(created_at);
  `
  ,
  job_status: `
    CREATE TABLE IF NOT EXISTS job_status (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'paused')),
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_status_status ON job_status(status);
    CREATE INDEX IF NOT EXISTS idx_job_status_started_at ON job_status(started_at);
  `,
  job_results: `
    CREATE TABLE IF NOT EXISTS job_results (
      job_id TEXT PRIMARY KEY,
      workflow_id TEXT,
      result TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_results_created_at ON job_results(created_at);
  `,
  agent_logs: `
    CREATE TABLE IF NOT EXISTS agent_logs (
      log_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      message TEXT,
      iteration INTEGER,
      message_type TEXT,
      metadata TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_logs_job ON agent_logs(job_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_time ON agent_logs(timestamp);
  `,
  agent_definitions: `
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('GENERAL','CEO','MANAGER','WORKER')),
      model_key TEXT,
      prompt_text TEXT,
      enabled INTEGER DEFAULT 1,
      tools TEXT,
      metadata TEXT,
      updated_at TEXT NOT NULL
    );
  `,
  network_definitions: `
    CREATE TABLE IF NOT EXISTS network_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_ids TEXT NOT NULL,
      default_agent_id TEXT NOT NULL,
      routing_preset TEXT,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `,
  
  // Content-Addressable Storage tables
  content_store: `
    CREATE TABLE IF NOT EXISTS content_store (
      content_hash TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      storage_location TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_content_store_type ON content_store(content_type);
    CREATE INDEX IF NOT EXISTS idx_content_store_created ON content_store(created_at);
  `,
  
  content_chunks: `
    CREATE TABLE IF NOT EXISTS content_chunks (
      chunk_id TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL REFERENCES content_store(content_hash),
      chunk_index INTEGER NOT NULL,
      chunk_data TEXT NOT NULL,
      offset INTEGER NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(content_hash, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS idx_content_chunks_hash ON content_chunks(content_hash);
    CREATE INDEX IF NOT EXISTS idx_content_chunks_order ON content_chunks(content_hash, chunk_index);
  `,
  
  artifacts: `
    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      task_id TEXT,
      current_revision TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      labels TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_job ON artifacts(job_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at);
  `,
  
  artifact_revisions: `
    CREATE TABLE IF NOT EXISTS artifact_revisions (
      revision_id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
      content_hash TEXT NOT NULL REFERENCES content_store(content_hash),
      parent_revisions TEXT,
      commit_message TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      patch_from_parent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_artifact ON artifact_revisions(artifact_id);
    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_hash ON artifact_revisions(content_hash);
    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_created ON artifact_revisions(created_at);
  `
};
