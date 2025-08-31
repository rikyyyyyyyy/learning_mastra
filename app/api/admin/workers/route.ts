import { NextRequest, NextResponse } from 'next/server';
import { ensureTaskDBInitialized } from '@/src/mastra/task-management/db/init';
import { getDAOs } from '@/src/mastra/task-management/db/dao';

export async function GET(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const includeBuiltin = searchParams.get('includeBuiltin') === 'true';
  const { agentDefinitions } = getDAOs();

  if (id) {
    const one = await agentDefinitions.findById(id);
    if (!one || one.role !== 'WORKER') return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(one);
  }

  const all = await agentDefinitions.findAll();
  const workers = all.filter((a) => a.role === 'WORKER');
  if (!includeBuiltin) return NextResponse.json(workers);
  const builtin = [{
    id: 'worker-default',
    name: 'Default Worker (built-in)',
    role: 'WORKER' as const,
    model_key: undefined,
    prompt_text: undefined,
    enabled: true,
    tools: undefined,
    metadata: undefined,
    updated_at: new Date().toISOString(),
  }];
  return NextResponse.json([...builtin, ...workers]);
}

export async function POST(req: NextRequest) {
  await ensureTaskDBInitialized();
  const body = await req.json();
  const { agentDefinitions } = getDAOs();
  const genId = () => `worker-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
  const saved = await agentDefinitions.upsert({
    id: body.id || genId(),
    name: body.name,
    role: 'WORKER',
    model_key: undefined, // モデルはUIで設定不可
    prompt_text: body.prompt_text,
    enabled: !!body.enabled,
    tools: undefined, // 任意ツールは扱わない（必須はランタイム注入）
    metadata: body.metadata ?? undefined,
  });
  return NextResponse.json(saved);
}

export async function PATCH(req: NextRequest) {
  await ensureTaskDBInitialized();
  const body = await req.json();
  const { agentDefinitions } = getDAOs();
  const saved = await agentDefinitions.upsert({
    id: body.id,
    name: body.name,
    role: 'WORKER',
    model_key: undefined,
    prompt_text: body.prompt_text,
    enabled: !!body.enabled,
    tools: undefined,
    metadata: body.metadata ?? undefined,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { agentDefinitions } = getDAOs();
  const one = await agentDefinitions.findById(id);
  if (!one || one.role !== 'WORKER') return NextResponse.json({ error: 'not found' }, { status: 404 });
  await agentDefinitions.delete(id);
  return NextResponse.json({ success: true });
}
