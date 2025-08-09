import { z } from 'zod';

// Task status enum
export const TaskStatus = z.enum(['queued', 'running', 'completed', 'failed', 'paused']);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Message type enum
export const MessageType = z.enum(['instruction', 'request', 'response', 'update']);
export type MessageType = z.infer<typeof MessageType>;

// Dependency type enum
export const DependencyType = z.enum(['requires_completion', 'uses_artifact', 'parallel']);
export type DependencyType = z.infer<typeof DependencyType>;

// Network task schema
export const NetworkTaskSchema = z.object({
  task_id: z.string(),
  parent_job_id: z.string().optional(),
  network_type: z.string().default('CEO-Manager-Worker'),
  status: TaskStatus,
  task_type: z.string(),
  task_description: z.string(),
  task_parameters: z.any().optional(),
  created_by: z.string(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type NetworkTask = z.infer<typeof NetworkTaskSchema>;

// Task artifact schema
export const TaskArtifactSchema = z.object({
  artifact_id: z.string(),
  task_id: z.string(),
  artifact_type: z.string(),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  is_public: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;

// Task communication schema
export const TaskCommunicationSchema = z.object({
  message_id: z.string(),
  from_task_id: z.string().optional(),
  to_task_id: z.string(),
  from_agent_id: z.string(),
  message_type: MessageType,
  content: z.string(),
  created_at: z.string(),
  read_at: z.string().optional(),
});

export type TaskCommunication = z.infer<typeof TaskCommunicationSchema>;

// Task dependency schema
export const TaskDependencySchema = z.object({
  dependency_id: z.string(),
  task_id: z.string(),
  depends_on_task_id: z.string(),
  dependency_type: DependencyType,
  created_at: z.string(),
});

export type TaskDependency = z.infer<typeof TaskDependencySchema>;

// SQL table creation statements
export const SQL_SCHEMAS = {
  network_tasks: `
    CREATE TABLE IF NOT EXISTS network_tasks (
      task_id TEXT PRIMARY KEY,
      parent_job_id TEXT,
      network_type TEXT DEFAULT 'CEO-Manager-Worker',
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'paused')),
      task_type TEXT NOT NULL,
      task_description TEXT NOT NULL,
      task_parameters TEXT,
      created_by TEXT NOT NULL,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_network_tasks_status ON network_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_parent_job ON network_tasks(parent_job_id);
    CREATE INDEX IF NOT EXISTS idx_network_tasks_created_by ON network_tasks(created_by);
  `,
  
  task_artifacts: `
    CREATE TABLE IF NOT EXISTS task_artifacts (
      artifact_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      is_public INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES network_tasks(task_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_artifacts_task_id ON task_artifacts(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_artifacts_type ON task_artifacts(artifact_type);
  `,
  
  task_communications: `
    CREATE TABLE IF NOT EXISTS task_communications (
      message_id TEXT PRIMARY KEY,
      from_task_id TEXT,
      to_task_id TEXT NOT NULL,
      from_agent_id TEXT NOT NULL,
      message_type TEXT NOT NULL CHECK(message_type IN ('instruction', 'request', 'response', 'update')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY (to_task_id) REFERENCES network_tasks(task_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_communications_to_task ON task_communications(to_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_communications_from_task ON task_communications(from_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_communications_unread ON task_communications(read_at) WHERE read_at IS NULL;
  `,
  
  task_dependencies: `
    CREATE TABLE IF NOT EXISTS task_dependencies (
      dependency_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      dependency_type TEXT NOT NULL CHECK(dependency_type IN ('requires_completion', 'uses_artifact', 'parallel')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES network_tasks(task_id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_task_id) REFERENCES network_tasks(task_id) ON DELETE CASCADE,
      UNIQUE(task_id, depends_on_task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
  `
};