import { NextResponse } from 'next/server';
import { resolveModel } from '@/src/mastra/config/model-registry';

export async function GET() {
  const keys = ['gpt-5','openai-o3','gemini-2.5-flash','claude-sonnet-4'];
  const infos = keys.map((k) => ({ key: k, info: resolveModel(k).info }));
  return NextResponse.json(infos);
}

