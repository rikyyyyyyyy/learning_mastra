import { NextRequest, NextResponse } from 'next/server';
import { getDAOs } from '@/src/mastra/task-management/db/dao';
import { ensureTaskDBInitialized } from '@/src/mastra/task-management/db/init';

export async function GET(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const enabled = searchParams.get('enabled');
  const { networkDefinitions } = getDAOs();
  if (id) {
    const one = await networkDefinitions.findById(id);
    if (!one) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(one);
  }
  const defs = await networkDefinitions.findAll();
  if (enabled === '1') {
    const active = defs.find(d => d.enabled) || null;
    return NextResponse.json(active);
  }
  return NextResponse.json(defs);
}

export async function POST(req: NextRequest) {
  await ensureTaskDBInitialized();
  const body = await req.json();
  const { networkDefinitions } = getDAOs();
  const saved = await networkDefinitions.upsert({
    id: body.id,
    name: body.name,
    agent_ids: body.agent_ids,
    default_agent_id: body.default_agent_id,
    routing_preset: body.routing_preset,
    enabled: !!body.enabled,
  });
  return NextResponse.json(saved);
}

export async function PATCH(req: NextRequest) {
  await ensureTaskDBInitialized();
  const body = await req.json();
  const { networkDefinitions } = getDAOs();
  if (body.setActive === true && body.id) {
    await networkDefinitions.setActiveNetwork(body.id);
    const active = await networkDefinitions.findById(body.id);
    return NextResponse.json(active);
  }
  const saved = await networkDefinitions.upsert({
    id: body.id,
    name: body.name,
    agent_ids: body.agent_ids,
    default_agent_id: body.default_agent_id,
    routing_preset: body.routing_preset,
    enabled: !!body.enabled,
  });
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest) {
  await ensureTaskDBInitialized();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { networkDefinitions } = getDAOs();
  await networkDefinitions.delete(id);
  return NextResponse.json({ success: true });
}
