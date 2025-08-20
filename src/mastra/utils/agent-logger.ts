import { PinoLogger } from '@mastra/loggers';

// エージェント専用のロガー設定
export const createAgentLogger = (agentName: string) => {
  return new PinoLogger({
    name: `Agent:${agentName}`,
    level: (process.env.AGENT_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    // エージェント通信に特化したフォーマット
    formatters: {
      level: (label) => {
        return { level: label };
      },
      log: (obj: Record<string, unknown>) => {
        // エージェント通信のメタデータを強化
        const message = obj.message as string | undefined;
        const tools = obj.tools as unknown[] | undefined;
        
        if (message || obj.request || obj.response) {
          return {
            ...obj,
            agentName,
            timestamp: new Date().toISOString(),
            messageLength: message?.length || 0,
            hasTools: tools && tools.length > 0,
          };
        }
        return obj;
      },
    },
  });
};

// エージェント間のメッセージをトレース
export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: Date;
  iteration: number;
  type: 'request' | 'response' | 'internal';
  metadata?: {
    model?: string;
    tools?: string[];
    tokenCount?: number;
    executionTime?: number;
  };
}

// エージェント通信トレーサー
export class AgentCommunicationTracer {
  private messages: AgentMessage[] = [];
  private logger: PinoLogger;

  constructor() {
    this.logger = new PinoLogger({
      name: 'AgentTracer',
      level: 'debug' as const,
    });
  }

  addMessage(message: AgentMessage) {
    this.messages.push(message);
    this.logger.debug(JSON.stringify({
      category: 'agent-message',
      ...message,
    }));
  }

  getConversationHistory() {
    return this.messages;
  }

  getMessagesByAgent(agentId: string) {
    return this.messages.filter(
      msg => msg.from === agentId || msg.to === agentId
    );
  }

  getMessagesByIteration(iteration: number) {
    return this.messages.filter(msg => msg.iteration === iteration);
  }

  clear() {
    this.messages = [];
  }

  // 会話の要約を生成
  getSummary() {
    const agentStats = this.messages.reduce((acc, msg) => {
      if (!acc[msg.from]) acc[msg.from] = { sent: 0, received: 0 };
      if (!acc[msg.to]) acc[msg.to] = { sent: 0, received: 0 };
      
      acc[msg.from].sent++;
      acc[msg.to].received++;
      
      return acc;
    }, {} as Record<string, { sent: number; received: number }>);

    return {
      totalMessages: this.messages.length,
      totalIterations: Math.max(...this.messages.map(m => m.iteration), 0),
      agentStats,
      messageTypes: this.messages.reduce((acc, msg) => {
        acc[msg.type] = (acc[msg.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// グローバルトレーサーインスタンス（必要に応じて使用）
export const globalAgentTracer = new AgentCommunicationTracer();