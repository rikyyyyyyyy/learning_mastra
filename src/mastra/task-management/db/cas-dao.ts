import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { getTaskDB } from './migrations';
import type {
  ContentStore,
  ContentChunk,
  Artifact,
  ArtifactRevision,
} from './schema';

// Content-Addressable Storage DAO
export class ContentStoreDAO {
  private getDb() {
    const taskDB = getTaskDB();
    if (!taskDB) throw new Error('Database not initialized');
    return taskDB.getDatabase();
  }

  /**
   * コンテンツのSHA-256ハッシュを計算
   */
  private calculateHash(content: string | Buffer): string {
    const hash = createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }

  /**
   * コンテンツを保存（重複チェック付き）
   */
  async store(content: string, contentType: string): Promise<string> {
    const db = this.getDb();
    const contentBuffer = Buffer.from(content, 'utf-8');
    const contentHash = this.calculateHash(contentBuffer);
    const contentBase64 = contentBuffer.toString('base64');
    
    // 既存チェック
    const existing = await db.execute({
      sql: 'SELECT content_hash FROM content_store WHERE content_hash = ?',
      args: [contentHash],
    });
    
    if (existing.rows.length > 0) {
      // 既に存在する場合はハッシュのみ返す
      return contentHash;
    }
    
    // 新規保存
    await db.execute({
      sql: `INSERT INTO content_store (content_hash, content_type, content, size, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        contentHash,
        contentType,
        contentBase64,
        contentBuffer.length,
        new Date().toISOString(),
      ],
    });
    
    return contentHash;
  }

  /**
   * コンテンツを取得
   */
  async retrieve(contentHash: string): Promise<ContentStore | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM content_store WHERE content_hash = ?',
      args: [contentHash],
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      content_hash: row.content_hash,
      content_type: row.content_type,
      content: row.content,
      size: row.size,
      created_at: row.created_at,
      storage_location: row.storage_location,
    };
  }

  /**
   * デコードされたコンテンツを取得
   */
  async retrieveDecoded(contentHash: string): Promise<string | null> {
    const stored = await this.retrieve(contentHash);
    if (!stored) return null;
    
    return Buffer.from(stored.content, 'base64').toString('utf-8');
  }

  /**
   * チャンクを追加（ストリーミング用）
   */
  async appendChunk(
    contentHash: string,
    chunkData: string,
    chunkIndex: number,
    offset: number
  ): Promise<string> {
    const db = this.getDb();
    const chunkId = randomUUID();
    const chunkBuffer = Buffer.from(chunkData, 'utf-8');
    const chunkBase64 = chunkBuffer.toString('base64');
    
    await db.execute({
      sql: `INSERT INTO content_chunks (chunk_id, content_hash, chunk_index, chunk_data, offset, size, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        chunkId,
        contentHash,
        chunkIndex,
        chunkBase64,
        offset,
        chunkBuffer.length,
        new Date().toISOString(),
      ],
    });
    
    return chunkId;
  }

  /**
   * チャンクから完全なコンテンツを再構築
   */
  async reconstructFromChunks(contentHash: string): Promise<string | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: `SELECT chunk_data FROM content_chunks 
            WHERE content_hash = ? 
            ORDER BY chunk_index`,
      args: [contentHash],
    });
    
    if (result.rows.length === 0) return null;
    
    const chunks = result.rows.map((row: any) =>
      Buffer.from(row.chunk_data, 'base64').toString('utf-8')
    );
    
    return chunks.join('');
  }

  /**
   * コンテンツのメタデータを取得
   */
  async getMetadata(contentHash: string): Promise<{ size: number; type: string; created: string } | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT size, content_type, created_at FROM content_store WHERE content_hash = ?',
      args: [contentHash],
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      size: row.size,
      type: row.content_type,
      created: row.created_at,
    };
  }
}

// Artifact Management DAO
export class ArtifactDAO {
  private getDb() {
    const taskDB = getTaskDB();
    if (!taskDB) throw new Error('Database not initialized');
    return taskDB.getDatabase();
  }

  /**
   * アーティファクトを作成
   */
  async create(
    jobId: string,
    mimeType: string,
    taskId?: string,
    labels?: Record<string, string>
  ): Promise<Artifact> {
    const db = this.getDb();
    const artifactId = randomUUID();
    const revisionId = randomUUID();
    const now = new Date().toISOString();
    
    // 空のコンテンツで初期リビジョンを作成
    const contentStore = new ContentStoreDAO();
    const contentHash = await contentStore.store('', mimeType);
    
    // アーティファクト作成
    await db.execute({
      sql: `INSERT INTO artifacts (artifact_id, job_id, task_id, current_revision, mime_type, labels, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        artifactId,
        jobId,
        taskId || null,
        revisionId,
        mimeType,
        labels ? JSON.stringify(labels) : null,
        now,
        now,
      ],
    });
    
    // 初期リビジョン作成
    await db.execute({
      sql: `INSERT INTO artifact_revisions (revision_id, artifact_id, content_hash, parent_revisions, commit_message, author, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        revisionId,
        artifactId,
        contentHash,
        null,
        'Initial revision',
        'system',
        now,
      ],
    });
    
    return {
      artifact_id: artifactId,
      job_id: jobId,
      task_id: taskId,
      current_revision: revisionId,
      mime_type: mimeType,
      labels: labels,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * アーティファクトを取得
   */
  async get(artifactId: string): Promise<Artifact | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM artifacts WHERE artifact_id = ?',
      args: [artifactId],
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      artifact_id: row.artifact_id,
      job_id: row.job_id,
      task_id: row.task_id,
      current_revision: row.current_revision,
      mime_type: row.mime_type,
      labels: row.labels ? JSON.parse(row.labels) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * 新しいリビジョンをコミット
   */
  async commit(
    artifactId: string,
    contentHash: string,
    message: string,
    author: string,
    parentRevisions?: string[]
  ): Promise<ArtifactRevision> {
    const db = this.getDb();
    const revisionId = randomUUID();
    const now = new Date().toISOString();
    
    // リビジョン作成
    await db.execute({
      sql: `INSERT INTO artifact_revisions (revision_id, artifact_id, content_hash, parent_revisions, commit_message, author, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        revisionId,
        artifactId,
        contentHash,
        parentRevisions ? JSON.stringify(parentRevisions) : null,
        message,
        author,
        now,
      ],
    });
    
    // アーティファクトの現在リビジョンを更新
    await db.execute({
      sql: `UPDATE artifacts SET current_revision = ?, updated_at = ? WHERE artifact_id = ?`,
      args: [revisionId, now, artifactId],
    });
    
    return {
      revision_id: revisionId,
      artifact_id: artifactId,
      content_hash: contentHash,
      parent_revisions: parentRevisions,
      commit_message: message,
      author: author,
      created_at: now,
      patch_from_parent: undefined,
    };
  }

  /**
   * リビジョンを取得
   */
  async getRevision(revisionId: string): Promise<ArtifactRevision | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM artifact_revisions WHERE revision_id = ?',
      args: [revisionId],
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      revision_id: row.revision_id,
      artifact_id: row.artifact_id,
      content_hash: row.content_hash,
      parent_revisions: row.parent_revisions ? JSON.parse(row.parent_revisions) : undefined,
      commit_message: row.commit_message,
      author: row.author,
      created_at: row.created_at,
      patch_from_parent: row.patch_from_parent,
    };
  }

  /**
   * アーティファクトの全リビジョンを取得
   */
  async getRevisions(artifactId: string): Promise<ArtifactRevision[]> {
    const db = this.getDb();
    const result = await db.execute({
      sql: `SELECT * FROM artifact_revisions 
            WHERE artifact_id = ? 
            ORDER BY created_at DESC`,
      args: [artifactId],
    });
    
    return result.rows.map((row: any) => ({
      revision_id: row.revision_id,
      artifact_id: row.artifact_id,
      content_hash: row.content_hash,
      parent_revisions: row.parent_revisions ? JSON.parse(row.parent_revisions) : undefined,
      commit_message: row.commit_message,
      author: row.author,
      created_at: row.created_at,
      patch_from_parent: row.patch_from_parent,
    }));
  }

  /**
   * ジョブIDからアーティファクトを検索
   */
  async findByJobId(jobId: string): Promise<Artifact[]> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM artifacts WHERE job_id = ?',
      args: [jobId],
    });
    
    return result.rows.map((row: any) => ({
      artifact_id: row.artifact_id,
      job_id: row.job_id,
      task_id: row.task_id,
      current_revision: row.current_revision,
      mime_type: row.mime_type,
      labels: row.labels ? JSON.parse(row.labels) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * タスクIDからアーティファクトを検索
   */
  async findByTaskId(taskId: string): Promise<Artifact | null> {
    const db = this.getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM artifacts WHERE task_id = ?',
      args: [taskId],
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      artifact_id: row.artifact_id,
      job_id: row.job_id,
      task_id: row.task_id,
      current_revision: row.current_revision,
      mime_type: row.mime_type,
      labels: row.labels ? JSON.parse(row.labels) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// Export singleton instances
export const contentStoreDAO = new ContentStoreDAO();
export const artifactDAO = new ArtifactDAO();