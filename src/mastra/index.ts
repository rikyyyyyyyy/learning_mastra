
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { generalAgent } from './agents/general-agent';
import { workflowAgent } from './agents/workflow-agent';
import { workflowSearchAgent } from './agents/workflow-search-agent';
// New network agents
import { ceoAgent } from './agents/network/ceo-agent';
import { managerAgent } from './agents/network/manager-agent';
import { workerAgent } from './agents/network/worker-agent';

export const mastra = new Mastra({
  workflows: {},
  agents: { 
    generalAgent,
    workflowAgent,
    workflowSearchAgent,
    // New network agents
    'ceo-agent': ceoAgent,
    'manager-agent': managerAgent,
    'worker-agent': workerAgent,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: (process.env.LOG_LEVEL || 'debug') as 'debug' | 'info' | 'warn' | 'error',  // デバッグレベルに変更してLLM呼び出しのモデル名を記録
  }),
});

// エージェントをエクスポート
export { generalAgent, workflowAgent, workflowSearchAgent, ceoAgent, managerAgent, workerAgent };
