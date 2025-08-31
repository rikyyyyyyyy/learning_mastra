import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_KEYS = ['EXA_API_KEY', 'BRAVE_API_KEY'] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

function mask(v: string | undefined): string | null {
  if (!v) return null;
  if (v.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`;
}

function getEnvFilePath() {
  const cwd = process.cwd();
  return path.join(cwd, '.env.local');
}

function upsertEnv(key: AllowedKey, value: string) {
  const file = getEnvFilePath();
  let lines: string[] = [];
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    lines = raw.split(/\r?\n/);
  }
  let found = false;
  const next = lines.map((ln) => {
    const m = ln.match(/^([A-Z0-9_]+)=/);
    if (m && m[1] === key) { found = true; return `${key}=${value}`; }
    return ln;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(file, next.join('\n'));
  process.env[key] = value;
}

export async function GET() {
  const values: Record<string, { set: boolean; masked: string | null }> = {};
  ALLOWED_KEYS.forEach((k) => { values[k] = { set: !!process.env[k], masked: mask(process.env[k]) }; });
  return NextResponse.json({ keys: ALLOWED_KEYS, values });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = (body?.key as string) as AllowedKey;
    const value = String(body?.value ?? '');
    if (!ALLOWED_KEYS.includes(key)) return NextResponse.json({ error: 'key not allowed' }, { status: 400 });
    if (!value) return NextResponse.json({ error: 'value required' }, { status: 400 });
    upsertEnv(key, value);
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

