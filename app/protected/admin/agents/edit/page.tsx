"use client";
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type ModelInfo = { key: string; info: { displayName: string } };

export default function EditAgentPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') || '';

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [form, setForm] = useState({ id, name: '', role: 'WORKER', model_key: 'claude-sonnet-4', enabled: true, tools: [] as string[], prompt_text: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ms, ts, one] = await Promise.all([
          fetch('/api/admin/models').then(r => r.json()),
          fetch('/api/admin/tools').then(r => r.json()),
          fetch(`/api/admin/agents?id=${encodeURIComponent(id)}`).then(r => r.json()),
        ]);
        setModels(ms);
        setTools(ts.tools);
        setForm({
          id: one.id,
          name: one.name,
          role: one.role,
          model_key: one.model_key || 'claude-sonnet-4',
          enabled: !!one.enabled,
          tools: one.tools || [],
          prompt_text: one.prompt_text || '',
        });
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push('/protected/admin/agents');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">エージェント編集</h2>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <div className="grid gap-3 max-w-xl">
        <label className="grid gap-1">
          <span className="text-sm">ID（変更不可）</span>
          <input className="border rounded p-2 bg-gray-50 text-gray-800" value={form.id} readOnly />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">名前</span>
          <input className="border rounded p-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">役割</span>
          <select className="border rounded p-2" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="GENERAL">GENERAL</option>
            <option value="CEO">CEO</option>
            <option value="MANAGER">MANAGER</option>
            <option value="WORKER">WORKER</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm">モデル</span>
          <select className="border rounded p-2" value={form.model_key} onChange={e => setForm({ ...form, model_key: e.target.value })}>
            {models.map(m => (
              <option key={m.key} value={m.key}>{m.info.displayName}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm">プロンプト上書き（任意）</span>
          <textarea className="border rounded p-2" rows={6} value={form.prompt_text} onChange={e => setForm({ ...form, prompt_text: e.target.value })} />
        </label>
        <fieldset className="grid gap-1">
          <span className="text-sm">ツール（複数選択可）</span>
          <div className="flex flex-wrap gap-2">
            {tools.map(t => (
              <label key={t} className="flex items-center gap-1 border rounded px-2 py-1">
                <input type="checkbox" checked={form.tools.includes(t)} onChange={e => {
                  const next = new Set(form.tools);
                  if (e.target.checked) next.add(t); else next.delete(t);
                  setForm({ ...form, tools: Array.from(next) });
                }} />
                <span className="text-xs">{t}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> 有効
        </label>
        <div className="flex gap-2 mt-2">
          <button className="px-3 py-2 rounded bg-gray-200" onClick={() => history.back()}>戻る</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={submit} disabled={saving}>保存</button>
        </div>
      </div>
    </div>
  );
}

