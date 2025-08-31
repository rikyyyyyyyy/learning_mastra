"use client";
import { useEffect, useState } from 'react';

type WorkerDef = {
  id: string;
  name: string;
  role: 'WORKER';
  model_key?: string;
  prompt_text?: string;
  enabled: boolean;
  metadata?: { mcp?: { exa?: { enabled?: boolean } } };
  updated_at: string;
};

export default function WorkersAdminPage() {
  const [workers, setWorkers] = useState<WorkerDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/workers?includeBuiltin=true', { cache: 'no-store' });
      const data = await res.json();
      setWorkers(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function remove(id: string) {
    if (!confirm('削除しますか？この操作は取り消せません。')) return;
    try {
      const res = await fetch(`/api/admin/workers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('削除しました');
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function bulkToggle(enable: boolean) {
    const targets = Object.keys(selected).filter(k => selected[k]);
    if (targets.length === 0) { showToast('対象が選択されていません'); return; }
    try {
      await Promise.all(targets.map(async (id) => {
        const w = workers.find(x => x.id === id);
        if (!w) return;
        await fetch('/api/admin/workers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...w, enabled: enable }),
        });
      }));
      showToast(enable ? '選択したワーカーを有効化しました' : '選択したワーカーを無効化しました');
      await load();
      setSelected({});
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">ワーカー管理</h2>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-gray-200 text-sm" onClick={() => bulkToggle(true)}>選択を有効化</button>
          <button className="px-3 py-2 rounded bg-gray-200 text-sm" onClick={() => bulkToggle(false)}>選択を無効化</button>
          <a href="/protected/admin/workers/new" className="px-3 py-2 rounded bg-blue-600 text-white text-sm">新規作成</a>
        </div>
      </div>
      {toast && <div className="mb-3 p-2 bg-green-100 text-green-800 rounded text-sm">{toast}</div>}
      {loading && <p>読み込み中...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <table className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
              <th className="p-2"><input type="checkbox" onChange={e => {
                const all: Record<string, boolean> = {};
                workers.forEach(a => { all[a.id] = e.target.checked; });
                setSelected(all);
              }} /></th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">名前</th>
              <th className="p-2 text-left">モデル</th>
              <th className="p-2 text-left">Exa</th>
              <th className="p-2 text-left">有効</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <tr key={w.id} className="border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="p-2"><input type="checkbox" checked={!!selected[w.id]} onChange={e => setSelected(s => ({ ...s, [w.id]: e.target.checked }))} /></td>
                <td className="p-2">{w.id}</td>
                <td className="p-2">{w.name}</td>
                <td className="p-2">{w.model_key || '-'}</td>
                <td className="p-2">{w.metadata?.mcp?.exa?.enabled ? 'On' : 'Off'}</td>
                <td className="p-2">{w.enabled ? 'Yes' : 'No'}</td>
                <td className="p-2 text-right">
                  <a href={`/protected/admin/workers/edit?id=${encodeURIComponent(w.id)}`} className="px-2 py-1 rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">編集</a>
                  <button className="ml-2 px-2 py-1 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200" onClick={() => remove(w.id)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
