import { NextResponse } from 'next/server';
import { toolRegistry } from '@/src/mastra/config/tool-registry';

export async function GET() {
  const tools = Object.keys(toolRegistry);
  return NextResponse.json({ tools });
}

