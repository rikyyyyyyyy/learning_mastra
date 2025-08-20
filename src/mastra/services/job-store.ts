import { getTaskDB, initializeTaskManagementDB } from '../task-management/db/migrations';

export type JobStatusType = 'queued' | 'running' | 'completed' | 'failed' | 'paused';

export interface JobStatusRow {
  job_id: string;
  status: JobStatusType;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface JobResultRow {
  job_id: string;
  workflow_id: string | null;
  result: unknown;
  created_at: string;
}

export class JobStore {
  private async getDb() {
    let tdb = getTaskDB();
    if (!tdb) {
      const url = process.env.MASTRA_DB_URL || ':memory:';
      await initializeTaskManagementDB(url);
      tdb = getTaskDB();
    }
    return tdb!.getDatabase();
  }

  async initializeJob(jobId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute({
      sql: `INSERT OR REPLACE INTO job_status (job_id, status, started_at) VALUES (?, 'queued', COALESCE((SELECT started_at FROM job_status WHERE job_id = ?), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
      args: [jobId, jobId],
    });
  }

  async updateStatus(jobId: string, status: JobStatusType, options?: { error?: string; metadata?: Record<string, unknown> }): Promise<void> {
    const db = await this.getDb();
    const completedAt = (status === 'completed' || status === 'failed') ? new Date().toISOString() : null;
    await db.execute({
      sql: `INSERT INTO job_status (job_id, status, error, started_at, completed_at, metadata)
            VALUES (?, ?, ?, COALESCE((SELECT started_at FROM job_status WHERE job_id = ?), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET status=excluded.status, error=excluded.error, completed_at=excluded.completed_at, metadata=excluded.metadata`,
      args: [jobId, status, options?.error ?? null, jobId, completedAt, JSON.stringify(options?.metadata ?? null)],
    });
  }

  async storeResult(jobId: string, result: unknown, workflowId?: string): Promise<void> {
    const db = await this.getDb();
    await db.execute({
      sql: `INSERT OR REPLACE INTO job_results (job_id, workflow_id, result, created_at) VALUES (?, ?, ?, ?)` ,
      args: [jobId, workflowId ?? null, JSON.stringify(result), new Date().toISOString()],
    });
  }

  async getStatus(jobId: string): Promise<(JobStatusRow & { metadata?: Record<string, unknown> | null }) | null> {
    const db = await this.getDb();
    const rows = await db.execute({ sql: 'SELECT * FROM job_status WHERE job_id = ?', args: [jobId] });
    const row = (rows.rows[0] as any) || null;
    if (!row) return null;
    return {
      job_id: row.job_id,
      status: row.status,
      error: row.error,
      started_at: row.started_at,
      completed_at: row.completed_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  async getResult(jobId: string): Promise<JobResultRow | null> {
    const db = await this.getDb();
    const rows = await db.execute({ sql: 'SELECT * FROM job_results WHERE job_id = ?', args: [jobId] });
    const row = (rows.rows[0] as any) || null;
    if (!row) return null;
    return {
      job_id: row.job_id,
      workflow_id: row.workflow_id,
      result: row.result ? JSON.parse(row.result) : null,
      created_at: row.created_at,
    };
  }

  async listCompletedJobs(limit = 100): Promise<string[]> {
    const db = await this.getDb();
    const rows = await db.execute({ sql: "SELECT job_id FROM job_status WHERE status='completed' ORDER BY completed_at DESC LIMIT ?", args: [limit] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows.rows as any[]).map(r => r.job_id as string);
  }
}

export const jobStore = new JobStore();

