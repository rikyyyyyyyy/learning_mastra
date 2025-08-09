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
};