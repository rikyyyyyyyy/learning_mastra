"use client";
import { useEffect, useState } from 'react';

type EnvInfo = { keys: string[]; values: Record<string, { set: boolean; masked: string | null }> };

export default function EnvAdminPage() {
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch('/api/admin/env', { cache: 'no-store' });
    const data = (await res.json()) as EnvInfo;
    setEnv(data);
  }

  useEffect(() => { load(); }, []);

  async function save(key: string) {
    setError(null);
    try {
      const res = await fetch('/api/admin/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value: form[key] }) });
      if (!res.ok) throw new Error(await res.text());
      setToast(`${key} を保存しました`);
      setTimeout(() => setToast(null), 2000);
      await load();
      setForm((f) => ({ ...f, [key]: '' }));
    } catch (e) {
      setError(String(e));
    }
  }

  if (!env) return <p>読み込み中...</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">環境変数</h2>
      {toast && <div className="mb-3 p-2 bg-green-100 text-green-800 rounded text-sm dark:bg-green-900/30 dark:text-green-200">{toast}</div>}
      {error && <div className="mb-3 p-2 bg-red-100 text-red-800 rounded text-sm dark:bg-red-900/30 dark:text-red-200">{error}</div>}
      <div className="grid gap-3 max-w-2xl">
        {env.keys.map((k) => (
          <div key={k} className="border rounded p-3 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{k}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">現在: {env.values[k]?.masked || '未設定'}</div>
            </div>
            <div className="flex gap-2">
              <input className="border rounded p-2 flex-1 text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-800" type="password" placeholder="新しい値を入力" value={form[k] || ''} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => save(k)}>保存</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

