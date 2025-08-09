import { createClient } from '@libsql/client';
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
    taskDB = new TaskManagementDB(url);
    await taskDB.initialize();
  }
  return taskDB;
}

export function getTaskDB(): TaskManagementDB | null {
  return taskDB;
}