import { NextRequest, NextResponse } from 'next/server';
import { getDAOs } from '@/src/mastra/task-management/db/dao';
import { ensureTaskDBInitialized } from '@/src/mastra/task-management/db/init';
import { getToolsForRole } from '@/src/mastra/config/tool-registry';

export async function GET(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const includeBuiltin = searchParams.get('includeBuiltin') === 'true';
  const { agentDefinitions } = getDAOs();
  if (id) {
    const one = await agentDefinitions.findById(id);
    if (!one) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(one);
  }
  const defs = await agentDefinitions.findAll();
  if (!includeBuiltin) return NextResponse.json(defs);
  // 既定（コード内）エージェントも合算
  const builtin = [
    { id: 'ceo-agent', name: 'CEO Agent - Strategic Task Director', role: 'CEO' as const },
    { id: 'manager-agent', name: 'Manager Agent - Task Planner & Coordinator', role: 'MANAGER' as const },
    { id: 'worker-agent', name: 'Worker Agent - Task Executor', role: 'WORKER' as const },
  ].map(b => {
    const toolsObj = getToolsForRole(b.role);
    const toolKeys = Object.keys(toolsObj);
    return {
      id: b.id,
      name: b.name,
      role: b.role,
      model_key: undefined,
      prompt_text: undefined,
      enabled: true,
      tools: toolKeys,
      metadata: undefined,
      updated_at: new Date().toISOString(),
    };
  });
  return NextResponse.json([...builtin, ...defs]);
}

export async function POST(req: NextRequest) {
  await ensureTaskDBInitialized();
  const body = await req.json();
  const { agentDefinitions } = getDAOs();
  const saved = await agentDefinitions.upsert({
    id: body.id,
    name: body.name,
    role: body.role,
    model_key: body.model_key,
    prompt_text: body.prompt_text,
    enabled: !!body.enabled,
    tools: body.tools,
    metadata: body.metadata,
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
    role: body.role,
    model_key: body.model_key,
    prompt_text: body.prompt_text,
    enabled: !!body.enabled,
    tools: body.tools,
    metadata: body.metadata,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { agentDefinitions } = getDAOs();
  await agentDefinitions.delete(id);
  return NextResponse.json({ success: true });
}
