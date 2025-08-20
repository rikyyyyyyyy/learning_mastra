"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AgentDef = { id: string; name: string; enabled: boolean };

export default function NewNetworkPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [form, setForm] = useState({ id: '', name: '', agent_ids: [] as string[], default_agent_id: '', enabled: true, routing_preset: '' });
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await fetch('/api/admin/agents?includeBuiltin=true').then(r => r.json());
      const enabledAgents: AgentDef[] = list.filter((a: any) => a.enabled).map((a: any) => ({ id: a.id, name: a.name, enabled: a.enabled }));
      setAgents(enabledAgents);
      const autoId = `network-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      setForm(f => ({ ...f, id: autoId, name: `Network ${autoId.slice(-4)}` }));
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (!form.id || !form.name) { showToast('ID/名前の自動生成に失敗しました。再読み込みしてください'); return; }
      if (!form.default_agent_id) { showToast('デフォルトエージェントを選択してください'); return; }
      const res = await fetch('/api/admin/networks', {
        method: 'POST',
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

  const toggleAgent = (id: string, checked: boolean) => {
    const next = new Set(form.agent_ids);
    if (checked) next.add(id); else next.delete(id);
    setForm({ ...form, agent_ids: Array.from(next) });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">ネットワーク新規作成</h2>
      {toast && <div className="mb-3 p-2 bg-green-100 text-green-800 rounded text-sm">{toast}</div>}
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <div className="grid gap-3 max-w-xl">
        <label className="grid gap-1">
          <span className="text-sm">ID</span>
          <input className="border rounded p-2 bg-gray-50 text-gray-800" value={form.id} readOnly />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">名前</span>
          <input className="border rounded p-2 bg-gray-50 text-gray-800" value={form.name} readOnly />
        </label>
        <fieldset className="grid gap-1">
          <span className="text-sm">エージェント選択（有効なもの）</span>
          <div className="flex flex-col gap-2">
            {agents.map(a => (
              <div key={a.id} className="border rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.agent_ids.includes(a.id)} onChange={e => toggleAgent(a.id, e.target.checked)} />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name} ({a.id})</span>
                </label>
                {Array.isArray((a as any).tools) && (a as any).tools.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(a as any).tools.map((t: string) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/30 dark:text-green-200 dark:border-green-900/50 text-[11px]">{t}</span>
                    ))}
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
            {form.agent_ids.map(id => (
              <option key={id} value={id}>{id}</option>
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

