
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { generalAgent } from './agents/general-agent';
// New network agents
import { ceoAgent } from './agents/network/ceo-agent';
import { managerAgent } from './agents/network/manager-agent';
import { workerAgent } from './agents/network/worker-agent';
// Task management
import { initializeTaskManagementDB } from './task-management/db/migrations';

// Create storage instance
const storage = new LibSQLStore({
  // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
  url: ":memory:",
});

export const mastra = new Mastra({
  workflows: {},
  agents: { 
    generalAgent,
    // New network agents
    'ceo-agent': ceoAgent,
    'manager-agent': managerAgent,
    'worker-agent': workerAgent,
  },
  storage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: (process.env.LOG_LEVEL || 'debug') as 'debug' | 'info' | 'warn' | 'error',  // デバッグレベルに変更してLLM呼び出しのモデル名を記録
  }),
});

// Initialize task management database
initializeTaskManagementDB(':memory:').then(() => {
  console.log('✅ Task management database initialized');
}).catch((error) => {
  console.error('❌ Failed to initialize task management database:', error);
});

// エージェントをエクスポート
export { generalAgent, ceoAgent, managerAgent, workerAgent };
