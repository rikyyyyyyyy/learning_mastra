import { 
  NetworkTask, 
  NetworkDirective,
  TaskStatus,
  DirectiveStatus 
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

// Network Tasks DAO (拡張版)
export class NetworkTaskDAO extends BaseDAO {
  constructor() {
    super('network_tasks');
  }

  async create(task: Omit<NetworkTask, 'created_at' | 'updated_at' | 'priority'> & { priority?: 'low' | 'medium' | 'high' }): Promise<NetworkTask> {
    const now = new Date().toISOString();
    const fullTask: NetworkTask = {
      ...task,
      // priorityは小タスクでは使わないため、未指定時は'medium'で整合
      priority: (task as unknown as { priority?: 'low' | 'medium' | 'high' }).priority ?? 'medium',
      created_at: now,
      updated_at: now,
    };

    const query = `
      INSERT INTO network_tasks (
        task_id, network_id, parent_job_id, network_type, status, task_type,
        task_description, task_parameters, task_result, progress,
        created_by, assigned_to, priority, step_number, depends_on, execution_time,
        created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullTask.task_id,
      fullTask.network_id,
      fullTask.parent_job_id || null,
      fullTask.network_type,
      fullTask.status,
      fullTask.task_type,
      fullTask.task_description,
      JSON.stringify(fullTask.task_parameters || {}),
      JSON.stringify(fullTask.task_result || null),
      fullTask.progress,
      fullTask.created_by,
      fullTask.assigned_to || null,
      fullTask.priority,
      fullTask.step_number || null,
      JSON.stringify(fullTask.depends_on || []),
      fullTask.execution_time || null,
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

  async findByNetworkId(networkId: string): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE network_id = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [networkId]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  async findByStatus(status: TaskStatus): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE status = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [status]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  async findByNetworkAndStatus(networkId: string, status: TaskStatus): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE network_id = ? AND status = ? ORDER BY created_at ASC';
    const results = await this.execute(query, [networkId, status]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseTask(r));
  }

  // 次に実行すべきキュータスクをステップ番号昇順で取得
  async findNextQueuedByStep(networkId: string): Promise<NetworkTask | null> {
    const query = `
      SELECT * FROM network_tasks 
      WHERE network_id = ? AND status = 'queued'
      ORDER BY 
        CASE WHEN step_number IS NULL THEN 999999 ELSE step_number END ASC,
        created_at ASC
      LIMIT 1
    `;
    const result = await this.executeOne(query, [networkId]) as Record<string, unknown> | null;
    return result ? this.parseTask(result) : null;
  }

  async findByAssignedWorker(workerId: string): Promise<NetworkTask[]> {
    const query = 'SELECT * FROM network_tasks WHERE assigned_to = ? AND status IN (\'queued\', \'running\') ORDER BY created_at ASC';
    const results = await this.execute(query, [workerId]) as Record<string, unknown>[];
    
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

  async updateProgress(taskId: string, progress: number): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE network_tasks 
      SET progress = ?, updated_at = ?
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [Math.min(100, Math.max(0, progress)), now, taskId]);
  }

  async updateResult(taskId: string, result: unknown): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE network_tasks 
      SET task_result = ?, updated_at = ?
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [JSON.stringify(result), now, taskId]);
  }

  async updateStatusAndResult(taskId: string, status: TaskStatus, result: unknown, progress: number = 100): Promise<void> {
    const now = new Date().toISOString();
    
    // Get task start time to calculate execution time
    const task = await this.findById(taskId);
    let executionTime: number | null = null;
    if (task && (status === 'completed' || status === 'failed')) {
      executionTime = Date.now() - new Date(task.created_at).getTime();
    }
    
    const query = `
      UPDATE network_tasks 
      SET status = ?, task_result = ?, progress = ?, updated_at = ?, 
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END,
          execution_time = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE execution_time END
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [
      status, 
      JSON.stringify(result), 
      progress,
      now, 
      status, 
      now,
      status,
      executionTime,
      taskId
    ]);
  }

  async assignWorker(taskId: string, workerId: string): Promise<void> {
    const now = new Date().toISOString();
    const query = `
      UPDATE network_tasks 
      SET assigned_to = ?, updated_at = ?
      WHERE task_id = ?
    `;
    
    await this.executeRun(query, [workerId, now, taskId]);
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

  // 追加: 指定したステップ番号以降の未完了タスクを削除（完了済みは保持）
  async deleteTasksFromStep(networkId: string, fromStepNumber: number): Promise<void> {
    const query = `
      DELETE FROM network_tasks
      WHERE network_id = ?
        AND step_number IS NOT NULL
        AND step_number >= ?
        AND status != 'completed'
    `;
    await this.executeRun(query, [networkId, fromStepNumber]);
  }

  async getNetworkSummary(networkId: string): Promise<{
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    averageProgress: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(progress) as averageProgress
      FROM network_tasks
      WHERE network_id = ?
    `;
    
    const result = await this.executeOne(query, [networkId]) as {
      total: number;
      queued: number;
      running: number;
      completed: number;
      failed: number;
      averageProgress: number;
    } | null;
    
    return {
      total: result?.total || 0,
      queued: result?.queued || 0,
      running: result?.running || 0,
      completed: result?.completed || 0,
      failed: result?.failed || 0,
      averageProgress: result?.averageProgress || 0,
    };
  }

  private parseTask(row: Record<string, unknown>): NetworkTask {
    return {
      task_id: row.task_id as string,
      network_id: row.network_id as string,
      parent_job_id: row.parent_job_id as string | undefined,
      network_type: row.network_type as string,
      status: row.status as TaskStatus,
      task_type: row.task_type as string,
      task_description: row.task_description as string,
      task_parameters: row.task_parameters ? JSON.parse(row.task_parameters as string) : undefined,
      task_result: row.task_result ? JSON.parse(row.task_result as string) : undefined,
      progress: row.progress as number,
      created_by: row.created_by as string,
      assigned_to: row.assigned_to as string | undefined,
      // priority は DB 側でデフォルト 'medium' が設定されているため、null/undefined の場合は 'medium' を採用
      priority: ((row.priority as 'low' | 'medium' | 'high') ?? 'medium'),
      step_number: row.step_number as number | undefined,
      depends_on: row.depends_on ? JSON.parse(row.depends_on as string) : undefined,
      execution_time: row.execution_time as number | undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      completed_at: row.completed_at as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }
}

// Network Directives DAO (新規)
export class NetworkDirectiveDAO extends BaseDAO {
  constructor() {
    super('network_directives');
  }

  async create(directive: Omit<NetworkDirective, 'created_at' | 'updated_at'>): Promise<NetworkDirective> {
    const now = new Date().toISOString();
    const fullDirective: NetworkDirective = {
      ...directive,
      created_at: now,
      updated_at: now,
    };

    const query = `
      INSERT INTO network_directives (
        directive_id, network_id, directive_content, directive_type,
        source, status, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.executeRun(query, [
      fullDirective.directive_id,
      fullDirective.network_id,
      fullDirective.directive_content,
      fullDirective.directive_type,
      fullDirective.source,
      fullDirective.status,
      fullDirective.created_at,
      fullDirective.updated_at,
      JSON.stringify(fullDirective.metadata || {})
    ]);

    return fullDirective;
  }

  async findById(directiveId: string): Promise<NetworkDirective | null> {
    const query = 'SELECT * FROM network_directives WHERE directive_id = ?';
    const result = await this.executeOne(query, [directiveId]);
    
    if (!result) return null;
    
    return this.parseDirective(result as Record<string, unknown>);
  }

  async findByNetworkId(networkId: string): Promise<NetworkDirective[]> {
    const query = 'SELECT * FROM network_directives WHERE network_id = ? ORDER BY created_at DESC';
    const results = await this.execute(query, [networkId]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseDirective(r));
  }

  async findPendingByNetworkId(networkId: string): Promise<NetworkDirective[]> {
    const query = 'SELECT * FROM network_directives WHERE network_id = ? AND status = \'pending\' ORDER BY created_at ASC';
    const results = await this.execute(query, [networkId]) as Record<string, unknown>[];
    
    return results.map((r) => this.parseDirective(r));
  }

  async findUnacknowledged(): Promise<NetworkDirective[]> {
    const query = 'SELECT * FROM network_directives WHERE status = \'pending\' ORDER BY created_at ASC';
    const results = await this.execute(query, []) as Record<string, unknown>[];
    
    return results.map((r) => this.parseDirective(r));
  }

  async updateStatus(directiveId: string, status: DirectiveStatus): Promise<void> {
    const now = new Date().toISOString();
    const statusField = status === 'acknowledged' ? 'acknowledged_at' : 
                       status === 'applied' ? 'applied_at' : null;
    
    let query = `
      UPDATE network_directives 
      SET status = ?, updated_at = ?
    `;
    
    const params: unknown[] = [status, now];
    
    if (statusField) {
      query += `, ${statusField} = ?`;
      params.push(now);
    }
    
    query += ' WHERE directive_id = ?';
    params.push(directiveId);
    
    await this.executeRun(query, params);
  }

  async acknowledge(directiveId: string): Promise<void> {
    await this.updateStatus(directiveId, 'acknowledged');
  }

  async apply(directiveId: string): Promise<void> {
    await this.updateStatus(directiveId, 'applied');
  }

  async reject(directiveId: string): Promise<void> {
    await this.updateStatus(directiveId, 'rejected');
  }

  async hasUnacknowledgedDirectives(networkId: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM network_directives
      WHERE network_id = ? AND status = 'pending'
    `;
    
    const result = await this.executeOne(query, [networkId]) as { count: number };
    return result.count > 0;
  }

  private parseDirective(row: Record<string, unknown>): NetworkDirective {
    return {
      directive_id: row.directive_id as string,
      network_id: row.network_id as string,
      directive_content: row.directive_content as string,
      directive_type: row.directive_type as 'policy_update' | 'task_addition' | 'priority_change' | 'abort' | 'other',
      source: row.source as string,
      status: row.status as DirectiveStatus,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      acknowledged_at: row.acknowledged_at as string | undefined,
      applied_at: row.applied_at as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }
}

// Export singleton instances
let taskDAO: NetworkTaskDAO | null = null;
let directiveDAO: NetworkDirectiveDAO | null = null;
let agentDefDAO: AgentDefinitionDAO | null = null;
let networkDefDAO: NetworkDefinitionDAO | null = null;

export function getDAOs() {
  if (!taskDAO) {
    taskDAO = new NetworkTaskDAO();
    directiveDAO = new NetworkDirectiveDAO();
    agentDefDAO = new AgentDefinitionDAO();
    networkDefDAO = new NetworkDefinitionDAO();
  }
  
  return {
    tasks: taskDAO!,
    directives: directiveDAO!,
    agentDefinitions: agentDefDAO!,
    networkDefinitions: networkDefDAO!,
  };
}

// ============ New: Agent & Network Definitions DAOs ============

export interface AgentDefinitionRow {
  id: string;
  name: string;
  role: 'GENERAL' | 'CEO' | 'MANAGER' | 'WORKER';
  model_key?: string | null;
  prompt_text?: string | null;
  enabled: number; // 1/0
  tools?: string | null; // JSON
  metadata?: string | null; // JSON
  updated_at: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: 'GENERAL' | 'CEO' | 'MANAGER' | 'WORKER';
  model_key?: string;
  prompt_text?: string;
  enabled: boolean;
  tools?: string[];
  metadata?: Record<string, unknown>;
  updated_at: string;
}

export class AgentDefinitionDAO extends BaseDAO {
  constructor() {
    super('agent_definitions');
  }

  private parse(row: Record<string, unknown>): AgentDefinition {
    return {
      id: row.id as string,
      name: row.name as string,
      role: row.role as AgentDefinition['role'],
      model_key: (row.model_key as string | null) || undefined,
      prompt_text: (row.prompt_text as string | null) || undefined,
      enabled: ((row.enabled as number) ?? 1) === 1,
      tools: row.tools ? JSON.parse(row.tools as string) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      updated_at: row.updated_at as string,
    };
  }

  async findAll(): Promise<AgentDefinition[]> {
    const rows = await this.execute(`SELECT * FROM agent_definitions ORDER BY updated_at DESC`);
    return (rows as Record<string, unknown>[]).map(r => this.parse(r));
  }

  async findById(id: string): Promise<AgentDefinition | null> {
    const row = await this.executeOne(`SELECT * FROM agent_definitions WHERE id = ?`, [id]) as Record<string, unknown> | null;
    return row ? this.parse(row) : null;
  }

  async upsert(def: Omit<AgentDefinition, 'updated_at'>): Promise<AgentDefinition> {
    const now = new Date().toISOString();
    await this.executeRun(
      `INSERT INTO agent_definitions (id, name, role, model_key, prompt_text, enabled, tools, metadata, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, model_key=excluded.model_key, prompt_text=excluded.prompt_text, enabled=excluded.enabled, tools=excluded.tools, metadata=excluded.metadata, updated_at=excluded.updated_at`,
      [
        def.id, def.name, def.role, def.model_key ?? null, def.prompt_text ?? null,
        def.enabled ? 1 : 0, JSON.stringify(def.tools ?? null), JSON.stringify(def.metadata ?? null), now,
      ]
    );
    const row = await this.executeOne(`SELECT * FROM agent_definitions WHERE id = ?`, [def.id]) as Record<string, unknown>;
    return this.parse(row);
  }

  async delete(id: string): Promise<void> {
    await this.executeRun(`DELETE FROM agent_definitions WHERE id = ?`, [id]);
  }
}

export interface NetworkDefinition {
  id: string;
  name: string;
  agent_ids: string[]; // ordered
  default_agent_id: string;
  routing_preset?: string;
  enabled: boolean;
  updated_at: string;
}

export class NetworkDefinitionDAO extends BaseDAO {
  constructor() {
    super('network_definitions');
  }

  private parse(row: Record<string, unknown>): NetworkDefinition {
    return {
      id: row.id as string,
      name: row.name as string,
      agent_ids: row.agent_ids ? JSON.parse(row.agent_ids as string) : [],
      default_agent_id: row.default_agent_id as string,
      routing_preset: (row.routing_preset as string | null) || undefined,
      enabled: ((row.enabled as number) ?? 1) === 1,
      updated_at: row.updated_at as string,
    };
  }

  async findAll(): Promise<NetworkDefinition[]> {
    const rows = await this.execute(`SELECT * FROM network_definitions ORDER BY updated_at DESC`);
    return (rows as Record<string, unknown>[]).map(r => this.parse(r));
  }

  async findById(id: string): Promise<NetworkDefinition | null> {
    const row = await this.executeOne(`SELECT * FROM network_definitions WHERE id = ?`, [id]) as Record<string, unknown> | null;
    return row ? this.parse(row) : null;
  }

  async findFirstEnabled(): Promise<NetworkDefinition | null> {
    const row = await this.executeOne(`SELECT * FROM network_definitions WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1`) as Record<string, unknown> | null;
    return row ? this.parse(row) : null;
  }

  async setActiveNetwork(id: string): Promise<void> {
    // Disable all, then enable the selected one
    await this.executeRun(`UPDATE network_definitions SET enabled = 0 WHERE id <> ?`, [id]);
    await this.executeRun(`UPDATE network_definitions SET enabled = 1, updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }

  async upsert(def: Omit<NetworkDefinition, 'updated_at'>): Promise<NetworkDefinition> {
    const now = new Date().toISOString();
    await this.executeRun(
      `INSERT INTO network_definitions (id, name, agent_ids, default_agent_id, routing_preset, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, agent_ids=excluded.agent_ids, default_agent_id=excluded.default_agent_id, routing_preset=excluded.routing_preset, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [
        def.id, def.name, JSON.stringify(def.agent_ids), def.default_agent_id, def.routing_preset ?? null, def.enabled ? 1 : 0, now,
      ]
    );
    const row = await this.executeOne(`SELECT * FROM network_definitions WHERE id = ?`, [def.id]) as Record<string, unknown>;
    return this.parse(row);
  }

  async delete(id: string): Promise<void> {
    await this.executeRun(`DELETE FROM network_definitions WHERE id = ?`, [id]);
  }
}
