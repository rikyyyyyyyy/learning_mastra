import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { SQL_SCHEMAS } from './schema';

interface DBClient {
  execute: (params: { sql: string; args?: unknown[] } | string) => Promise<{ rows: unknown[] } | unknown>;
}

export class TaskManagementDB {
  private db: DBClient;
  
  constructor(url: string = ':memory:') {
    // Create our own LibSQL client
    this.db = createClient({
      url: url,
    }) as DBClient;
  }

  async initialize(): Promise<void> {
    try {
      console.log('🗄️ Initializing task management database...');
      
      // Run migrations
      await this.runMigrations();
      
      console.log('✅ Task management database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize task management database:', error);
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    // Create tables in order
    const migrations = [
      { name: 'network_tasks', sql: SQL_SCHEMAS.network_tasks },
      { name: 'network_directives', sql: SQL_SCHEMAS.network_directives },
      { name: 'job_status', sql: SQL_SCHEMAS.job_status },
      { name: 'job_results', sql: SQL_SCHEMAS.job_results },
      { name: 'agent_logs', sql: SQL_SCHEMAS.agent_logs },
      { name: 'agent_definitions', sql: SQL_SCHEMAS.agent_definitions },
      { name: 'network_definitions', sql: SQL_SCHEMAS.network_definitions },
      // Content-Addressable Storage tables
      { name: 'content_store', sql: SQL_SCHEMAS.content_store },
      { name: 'content_chunks', sql: SQL_SCHEMAS.content_chunks },
      { name: 'artifacts', sql: SQL_SCHEMAS.artifacts },
      { name: 'artifact_revisions', sql: SQL_SCHEMAS.artifact_revisions },
    ];

    for (const migration of migrations) {
      try {
        console.log(`Running migration: ${migration.name}`);
        
        // Split and execute each statement separately
        const statements = migration.sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const statement of statements) {
          await this.db.execute(statement + ';');
        }
        
        console.log(`✓ Migration completed: ${migration.name}`);
      } catch (error) {
        console.error(`✗ Migration failed for ${migration.name}:`, error);
        throw error;
      }
    }
  }

  // Utility method to get direct database access for DAOs
  getDatabase(): { execute: (params: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }> } {
    return this.db as { execute: (params: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }> };
  }

  // Clean up method for testing
  async cleanup(): Promise<void> {
    try {
      await this.db.execute('DROP TABLE IF EXISTS network_directives');
      await this.db.execute('DROP TABLE IF EXISTS network_tasks');
      console.log('🧹 Task management tables cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Singleton instance
let taskDB: TaskManagementDB | null = null;

export async function initializeTaskManagementDB(url: string = ':memory:'): Promise<TaskManagementDB> {
  if (!taskDB) {
    // In development, if using a file: URL, clear old DB to avoid stale tasks reappearing
    if (process.env.NODE_ENV !== 'production' && url.startsWith('file:')) {
      try {
        const raw = url.slice('file:'.length);
        const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
        if (fs.existsSync(resolved)) {
          console.log(`🧹 Clearing dev task DB at ${resolved}`);
          fs.unlinkSync(resolved);
        }
        // Clean possible SQLite WAL/SHM files
        const wal = `${resolved}-wal`;
        const shm = `${resolved}-shm`;
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
        if (fs.existsSync(shm)) fs.unlinkSync(shm);
      } catch (e) {
        console.warn('⚠️ Failed to wipe dev task DB file:', e);
      }
    }

    taskDB = new TaskManagementDB(url);
    await taskDB.initialize();
  }
  return taskDB;
}

export function getTaskDB(): TaskManagementDB | null {
  return taskDB;
}
