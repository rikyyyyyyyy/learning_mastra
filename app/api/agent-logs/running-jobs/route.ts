import { NextResponse } from 'next/server';
import { agentLogStore } from '@/src/mastra/utils/agent-log-store';

export async function GET() {
  try {
    const runningJobs = agentLogStore.getRunningJobs();
    const allJobs = Array.from(agentLogStore.getAllJobs().entries()).map(([jobId, job]) => ({
      jobId,
      taskType: job.taskType,
      status: job.status,
      startTime: job.startTime,
      conversationCount: job.conversationHistory.length
    }));
    
    return NextResponse.json({
      running: runningJobs,
      all: allJobs,
      count: {
        running: runningJobs.length,
        total: allJobs.length
      }
    });
  } catch (error) {
    console.error('Error getting running jobs:', error);
    return NextResponse.json(
      { error: 'Failed to get running jobs' },
      { status: 500 }
    );
  }
}