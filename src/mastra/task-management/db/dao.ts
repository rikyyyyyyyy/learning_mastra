import { 
  NetworkTask, 
  TaskArtifact, 
  TaskCommunication, 
  TaskDependency,
  TaskStatus 
} from './schema';
import { getTaskDB } from './migrations';

// Base DAO class with common operations
abstract class BaseDAO {
  protected db: {
    execute: (params: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }>;
  };
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
    const taskDB = getTaskDB();
    if (!taskDB) {
      throw new Error('Task management database not initialized');
    }
    this.db = taskDB.getDatabase();
  }

  protected async execute(query: string, params: unknown[] = []): Promise<unknown[]> {
    try {
      const result = await this.db.execute({ sql: query, args: params });
      return result.rows;
    } catch (error) {
      console.error(`Database error in ${this.tableName}:`, error);
      throw error;
    }
  }

  protected async executeOne(query: string, params: unknown[] = []): Promise<unknown> {
    try {
      const result = await this.db.execute({ sql: query, args: params });
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Database error in ${this.tableName}:`, error);
      throw error;
    }
  }

  protected async executeRun(query: string, params: unknown[] = []): Promise<void> {
    try {
      await this.db.execute({ sql: query, args: params });
    } catch (error) {
      console.error(`Database error in ${this.tableName}:`, error);
      throw error;
    }
  }
}

// Network Tasks DAO
export class NetworkTaskDAO extends BaseDAO {
  constructor() {
    super('network_tasks');
  }

  async create(task: Omit<NetworkTask, 'created_at' | 'updated_at'>): Promise<NetworkTask> {
    const now = new Date().toISOString();
    const fullTask: NetworkTask = {
      ...task,
      created_at: now,
      updated_at: now,
    };

    const query = `
      INSERT INTO network_tasks (
        task_id, parent_job_id, network_type, status, task_type,
        task_description, task_parameters, created_by, priority,
        created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullTask.task_id,
      fullTask.parent_job_id || null,
      fullTask.network_type,
      fullTask.status,
      fullTask.task_type,
      fullTask.task_description,
      JSON.stringify(fullTask.task_parameters || {}),
      fullTask.created_by,
      fullTask.priority,
      fullTask.created_at,
      fullTask.updated_at,
      JSON.stringify(fullTask.metadata || {})
    ]);

    return fullTask;
  }

  async findById(taskId: string): Promise<NetworkTask | null> {
    const query = 'SELECT * FROM network_tasks WHERE task_id = ?';
    const result = await this.executeOne(query, [taskId]);
    
    if (!result) return null;
    
    return this.parseTask(result as Record<string, unknown>);
  }

  async findByStatus(status: TaskStatus): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE status = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [status]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  async findByCreator(createdBy: string): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE created_by = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [createdBy]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  async findRunningTasks(): Promise<NetworkTask[]> {
    const query = `
      SELECT * FROM network_tasks 
      WHERE status IN ('running', 'queued') 
      ORDER BY priority DESC, created_at ASC
    `;
    const results = await this.execute(query) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE network_tasks 
      SET status = ?, updated_at = ?, 
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [status, now, status, now, taskId]);
  }

  async updateMetadata(taskId: string, metadata: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE network_tasks 
      SET metadata = ?, updated_at = ?
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [JSON.stringify(metadata), now, taskId]);
  }

  private parseTask(row: Record<string, unknown>): NetworkTask {
    return {
      task_id: row.task_id as string,
      parent_job_id: row.parent_job_id as string | undefined,
      network_type: row.network_type as string,
      status: row.status as TaskStatus,
      task_type: row.task_type as string,
      task_description: row.task_description as string,
      task_parameters: row.task_parameters ? JSON.parse(row.task_parameters as string) : undefined,
      created_by: row.created_by as string,
      priority: row.priority as 'low' | 'medium' | 'high',
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      completed_at: row.completed_at as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }
}

// Task Artifacts DAO
export class TaskArtifactDAO extends BaseDAO {
  constructor() {
    super('task_artifacts');
  }

  async create(artifact: Omit<TaskArtifact, 'created_at' | 'updated_at'>): Promise<TaskArtifact> {
    const now = new Date().toISOString();
    const fullArtifact: TaskArtifact = {
      ...artifact,
      created_at: now,
      updated_at: now,
    };

    const query = `
      INSERT INTO task_artifacts (
        artifact_id, task_id, artifact_type, content,
        metadata, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullArtifact.artifact_id,
      fullArtifact.task_id,
      fullArtifact.artifact_type,
      fullArtifact.content,
      JSON.stringify(fullArtifact.metadata || {}),
      fullArtifact.is_public ? 1 : 0,
      fullArtifact.created_at,
      fullArtifact.updated_at
    ]);

    return fullArtifact;
  }

  async findById(artifactId: string): Promise<TaskArtifact | null> {
    const query = 'SELECT * FROM task_artifacts WHERE artifact_id = ?';
    const result = await this.executeOne(query, [artifactId]);
    
    if (!result) return null;
    
    return this.parseArtifact(result as Record<string, unknown>);
  }

  async findByTaskId(taskId: string): Promise<TaskArtifact[]> {
    const query = 'SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [taskId]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseArtifact(r));
  }

  async findPublicByType(artifactType: string): Promise<TaskArtifact[]> {
    const query = `
      SELECT * FROM task_artifacts 
      WHERE artifact_type = ? AND is_public = 1 
      ORDER BY created_at DESC
    `;
    const results = await this.execute(query, [artifactType]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseArtifact(r));
  }

  async updateContent(artifactId: string, content: string): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE task_artifacts 
      SET content = ?, updated_at = ?
      WHERE artifact_id = ?
    `;
    
    await this.executeRun(query, [content, now, artifactId]);
  }

  private parseArtifact(row: Record<string, unknown>): TaskArtifact {
    return {
      artifact_id: row.artifact_id as string,
      task_id: row.task_id as string,
      artifact_type: row.artifact_type as string,
      content: row.content as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      is_public: row.is_public === 1,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

// Task Communications DAO
export class TaskCommunicationDAO extends BaseDAO {
  constructor() {
    super('task_communications');
  }

  async create(message: Omit<TaskCommunication, 'created_at'>): Promise<TaskCommunication> {
    const now = new Date().toISOString();
    const fullMessage: TaskCommunication = {
      ...message,
      created_at: now,
    };

    const query = `
      INSERT INTO task_communications (
        message_id, from_task_id, to_task_id, from_agent_id,
        message_type, content, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullMessage.message_id,
      fullMessage.from_task_id || null,
      fullMessage.to_task_id,
      fullMessage.from_agent_id,
      fullMessage.message_type,
      fullMessage.content,
      fullMessage.created_at
    ]);

    return fullMessage;
  }

  async findUnreadByTaskId(taskId: string): Promise<TaskCommunication[]> {
    const query = `
      SELECT * FROM task_communications 
      WHERE to_task_id = ? AND read_at IS NULL 
      ORDER BY created_at ASC
    `;
    const results = await this.execute(query, [taskId]) as TaskCommunication[];
    
    return results;
  }

  async findByTaskId(taskId: string, limit: number = 50): Promise<TaskCommunication[]> {
    const query = `
      SELECT * FROM task_communications 
      WHERE to_task_id = ? OR from_task_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const results = await this.execute(query, [taskId, taskId, limit]) as TaskCommunication[];
    
    return results;
  }

  async markAsRead(messageId: string): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE task_communications 
      SET read_at = ?
      WHERE message_id = ?
    `;
    
    await this.executeRun(query, [now, messageId]);
  }

  async markAllAsReadForTask(taskId: string): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE task_communications 
      SET read_at = ?
      WHERE to_task_id = ? AND read_at IS NULL
    `;
    
    await this.executeRun(query, [now, taskId]);
  }
}

// Task Dependencies DAO
export class TaskDependencyDAO extends BaseDAO {
  constructor() {
    super('task_dependencies');
  }

  async create(dependency: Omit<TaskDependency, 'created_at'>): Promise<TaskDependency> {
    const now = new Date().toISOString();
    const fullDependency: TaskDependency = {
      ...dependency,
      created_at: now,
    };

    const query = `
      INSERT INTO task_dependencies (
        dependency_id, task_id, depends_on_task_id,
        dependency_type, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullDependency.dependency_id,
      fullDependency.task_id,
      fullDependency.depends_on_task_id,
      fullDependency.dependency_type,
      fullDependency.created_at
    ]);

    return fullDependency;
  }

  async findByTaskId(taskId: string): Promise<TaskDependency[]> {
    const query = 'SELECT * FROM task_dependencies WHERE task_id = ?';
    const results = await this.execute(query, [taskId]) as TaskDependency[];
    
    return results;
  }

  async findDependentTasks(taskId: string): Promise<TaskDependency[]> {
    const query = 'SELECT * FROM task_dependencies WHERE depends_on_task_id = ?';
    const results = await this.execute(query, [taskId]) as TaskDependency[];
    
    return results;
  }

  async checkDependenciesSatisfied(taskId: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM task_dependencies td
      JOIN network_tasks nt ON td.depends_on_task_id = nt.task_id
      WHERE td.task_id = ? 
        AND td.dependency_type = 'requires_completion'
        AND nt.status != 'completed'
    `;
    
    const result = await this.executeOne(query, [taskId]) as { count: number };
    return result.count === 0;
  }
}

// Export singleton instances
let taskDAO: NetworkTaskDAO | null = null;
let artifactDAO: TaskArtifactDAO | null = null;
let communicationDAO: TaskCommunicationDAO | null = null;
let dependencyDAO: TaskDependencyDAO | null = null;

export function getDAOs() {
  if (!taskDAO) {
    taskDAO = new NetworkTaskDAO();
    artifactDAO = new TaskArtifactDAO();
    communicationDAO = new TaskCommunicationDAO();
    dependencyDAO = new TaskDependencyDAO();
  }
  
  return {
    tasks: taskDAO!,
    artifacts: artifactDAO!,
    communications: communicationDAO!,
    dependencies: dependencyDAO!,
  };
}