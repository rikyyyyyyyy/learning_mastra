import { NextResponse } from 'next/server';
import { listModels } from '@/src/mastra/config/model-registry';

export async function GET() {
  const models = listModels();
  return NextResponse.json(models);
}
