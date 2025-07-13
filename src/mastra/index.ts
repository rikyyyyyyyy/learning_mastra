
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { webSearchWorkflow } from './workflows/web-search-workflow-mcp';
import { slideGenerationWorkflow } from './workflows/slide-generation-workflow';
import { weatherAgent } from './agents/weather-agent';
import { generalAgent } from './agents/general-agent';
import { workflowAgent } from './agents/workflow-agent';
import { workflowSearchAgent } from './agents/workflow-search-agent';

export const mastra = new Mastra({
  workflows: { 
    weatherWorkflow,
    webSearchWorkflow,
    slideGenerationWorkflow,
  },
  agents: { 
    weatherAgent, 
    generalAgent,
    workflowAgent,
    workflowSearchAgent,
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
export { generalAgent, workflowAgent, workflowSearchAgent };
