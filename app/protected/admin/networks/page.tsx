"use client";
import { useEffect, useState } from 'react';

type NetworkDef = {
  id: string;
  name: string;
  agent_ids: string[];
  default_agent_id: string;
  routing_preset?: string;
  enabled: boolean;
  updated_at: string;
};

export default function NetworksAdminPage() {
  const [nets, setNets] = useState<NetworkDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [listRes, activeRes] = await Promise.all([
        fetch('/api/admin/networks', { cache: 'no-store' }),
        fetch('/api/admin/networks?enabled=1', { cache: 'no-store' }).catch(() => null),
      ]);
      const list = await listRes.json();
      setNets(list);
      try {
        const enabledId = (list.find((n: NetworkDef) => n.enabled) || null)?.id || null;
        setActiveId(enabledId);
      } catch {}
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
      const res = await fetch(`/api/admin/networks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('削除しました');
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function setActive(id: string) {
    try {
      const res = await fetch('/api/admin/networks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, setActive: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      setActiveId(id);
      showToast('このネットワークを有効にしました');
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">ネットワーク定義</h2>
        <a href="/protected/admin/networks/new" className="px-3 py-2 rounded bg-blue-600 text-white text-sm">新規作成</a>
      </div>
      {toast && <div className="mb-3 p-2 bg-green-100 text-green-800 rounded text-sm">{toast}</div>}
      {loading && <p>読み込み中...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <table className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200">
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">名前</th>
              <th className="p-2 text-left">エージェント数</th>
              <th className="p-2 text-left">デフォルト</th>
              <th className="p-2 text-left">状態</th>
              <th className="p-2 text-left">有効</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {nets.map(n => (
              <tr key={n.id} className="border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="p-2">{n.id}</td>
                <td className="p-2">{n.name}</td>
                <td className="p-2">{n.agent_ids.length}</td>
                <td className="p-2">{n.default_agent_id}</td>
                <td className="p-2">
                  {activeId === n.id ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/50 text-[11px]">現在のネットワーク</span>
                  ) : (
                    <button className="px-2 py-0.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setActive(n.id)}>有効化</button>
                  )}
                </td>
                <td className="p-2">{n.enabled ? 'Yes' : 'No'}</td>
                <td className="p-2 text-right">
                  <a href={`/protected/admin/networks/edit?id=${encodeURIComponent(n.id)}`} className="underline mr-3">編集</a>
                  <button className="text-red-600 underline" onClick={() => remove(n.id)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

