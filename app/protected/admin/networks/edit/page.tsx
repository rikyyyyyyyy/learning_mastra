"use client";
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type AgentDef = { id: string; name: string; enabled: boolean };

export default function EditNetworkPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') || '';

  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [form, setForm] = useState({ id, name: '', agent_ids: [] as string[], default_agent_id: '', enabled: true, routing_preset: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [listAgents, one] = await Promise.all([
          fetch('/api/admin/agents').then(r => r.json()),
          fetch(`/api/admin/networks?id=${encodeURIComponent(id)}`).then(r => r.json()),
        ]);
        const enabledAgents: AgentDef[] = listAgents.filter((a: any) => a.enabled).map((a: any) => ({ id: a.id, name: a.name, enabled: a.enabled }));
        setAgents(enabledAgents);
        setForm({
          id: one.id,
          name: one.name,
          agent_ids: one.agent_ids || [],
          default_agent_id: one.default_agent_id || '',
          enabled: !!one.enabled,
          routing_preset: one.routing_preset || '',
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
      const res = await fetch('/api/admin/networks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push('/protected/admin/networks');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>読み込み中...</p>;

  const toggleAgent = (aid: string, checked: boolean) => {
    const next = new Set(form.agent_ids);
    if (checked) next.add(aid); else next.delete(aid);
    setForm({ ...form, agent_ids: Array.from(next) });
  };

  // 簡易並べ替え（先頭/末尾へ）
  const moveAgent = (aid: string, dir: 'up'|'down') => {
    const idx = form.agent_ids.indexOf(aid);
    if (idx === -1) return;
    const arr = [...form.agent_ids];
    if (dir === 'up' && idx > 0) {
      [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
    } else if (dir === 'down' && idx < arr.length - 1) {
      [arr[idx+1], arr[idx]] = [arr[idx], arr[idx+1]];
    }
    setForm({ ...form, agent_ids: arr });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">ネットワーク編集</h2>
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
        <fieldset className="grid gap-1">
          <span className="text-sm">エージェント選択（有効なもの）</span>
          <div className="flex flex-col gap-2">
            {agents.map(a => (
              <div key={a.id} className="flex items-center gap-2 border rounded px-2 py-1">
                <input type="checkbox" checked={form.agent_ids.includes(a.id)} onChange={e => toggleAgent(a.id, e.target.checked)} />
                <span className="text-xs flex-1">{a.name} ({a.id})</span>
                {form.agent_ids.includes(a.id) && (
                  <div className="flex gap-1">
                    <button className="px-2 py-0.5 border rounded" onClick={() => moveAgent(a.id, 'up')}>↑</button>
                    <button className="px-2 py-0.5 border rounded" onClick={() => moveAgent(a.id, 'down')}>↓</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1">
          <span className="text-sm">デフォルトエージェント</span>
          <select className="border rounded p-2" value={form.default_agent_id} onChange={e => setForm({ ...form, default_agent_id: e.target.value })}>
            <option value="">（選択）</option>
            {form.agent_ids.map(id2 => (
              <option key={id2} value={id2}>{id2}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> 有効
        </label>
        <label className="grid gap-1">
          <span className="text-sm">ルーティングプリセット（任意）</span>
          <input className="border rounded p-2" value={form.routing_preset} onChange={e => setForm({ ...form, routing_preset: e.target.value })} placeholder="例: ceo-manager-worker" />
        </label>
        <div className="flex gap-2 mt-2">
          <button className="px-3 py-2 rounded bg-gray-200" onClick={() => history.back()}>戻る</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={submit} disabled={saving}>保存</button>
        </div>
      </div>
    </div>
  );
}

