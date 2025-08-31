import { NextResponse } from 'next/server';
import { AGENT_PROMPTS } from '@/src/mastra/prompts/agent-prompts';

export async function GET() {
  // システムコンテキスト無しのベースプロンプト
  return NextResponse.json({ base: AGENT_PROMPTS.WORKER_AGENT });
}

