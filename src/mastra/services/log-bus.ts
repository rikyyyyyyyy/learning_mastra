import { EventEmitter } from 'events';
import { getTaskDB } from '../task-management/db/migrations';

export type AgentLogEvent = {
  jobId: string;
  agentId?: string;
  agentName?: string;
  message: string;
  iteration?: number;
  messageType?: 'request' | 'response' | 'internal';
  metadata?: Record<string, unknown>;
  timestamp: string;
};

export interface LogSink {
  write(event: AgentLogEvent): Promise<void>;
}

export class ConsoleSink implements LogSink {
  async write(event: AgentLogEvent): Promise<void> {
    console.log(`[LOG] ${event.timestamp} job=${event.jobId} agent=${event.agentId} type=${event.messageType} msg=${event.message.substring(0, 120)}`);
  }
}

export class DbSink implements LogSink {
  private db = getTaskDB()!.getDatabase();
  async write(event: AgentLogEvent): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO agent_logs (log_id, job_id, agent_id, agent_name, message, iteration, message_type, metadata, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      args: [
        `${event.jobId}-${event.timestamp}-${Math.random().toString(36).slice(2)}`,
        event.jobId,
        event.agentId ?? null,
        event.agentName ?? null,
        event.message,
        event.iteration ?? null,
        event.messageType ?? null,
        JSON.stringify(event.metadata ?? null),
        event.timestamp,
      ],
    });
  }
}

export class LogBus extends EventEmitter {
  private sinks: LogSink[] = [];

  addSink(sink: LogSink) {
    this.sinks.push(sink);
  }

  async publish(event: AgentLogEvent) {
    this.emit('log', event);
    await Promise.all(this.sinks.map((s) => s.write(event).catch(err => console.warn('Log sink error:', err))));
  }
}

export const logBus = new LogBus();

