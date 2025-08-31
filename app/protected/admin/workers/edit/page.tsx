"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// モデル設定は行わない（自動選択）
type CustomMCP = { id: string; kind: 'remote' | 'local'; url?: string; command?: string; args?: string };

function EditWorkerPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') || '';

  // モデルの選択UIは廃止
  type Metadata = { mcp?: { exa?: { enabled?: boolean } } };
  const [form, setForm] = useState({ id, name: '', enabled: true, prompt_text: '', metadata: { mcp: { exa: { enabled: false }, custom: [] as CustomMCP[] } } as Metadata & { mcp: { custom: CustomMCP[] } } });
  const [basePrompt, setBasePrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [one, { base }] = await Promise.all([
          fetch(`/api/admin/workers?id=${encodeURIComponent(id)}`).then(r => r.json()),
          fetch('/api/admin/prompts/worker-base').then(r => r.json()),
        ]);
        setBasePrompt(base || '');
        setForm({
          id: one.id,
          name: one.name,
          enabled: !!one.enabled,
          prompt_text: one.prompt_text || '',
          metadata: one.metadata || { mcp: { exa: { enabled: false }, custom: [] } },
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
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push('/protected/admin/workers');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">ワーカー編集</h2>
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
        {/* モデル設定は行わない（自動選択） */}
        <fieldset className="grid gap-1">
          <span className="text-sm">MCP/ツール設定</span>
          <label className="flex items-center gap-2 border rounded px-2 py-1">
            <input
              type="checkbox"
              checked={(form.metadata).mcp?.exa?.enabled ?? false}
              onChange={e => setForm(f => ({
                ...f,
                metadata: { mcp: { ...(f.metadata.mcp || {}), exa: { enabled: e.target.checked }, custom: (f.metadata.mcp?.custom || []) } },
              }))}
            />
            <span className="text-xs">Exa 検索を有効化（.env に EXA_API_KEY が必要）</span>
          </label>
          <p className="text-xs text-gray-500">必須ツール（固定・常時注入）: docsReader, taskManagement, artifact-io, artifact-diff, content-store, subtask-artifact</p>
          <div className="mt-2 border-t pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">カスタムMCPサーバ</span>
              <button type="button" className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" onClick={() => setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: [...(f.metadata.mcp?.custom || []), { id: '', kind: 'remote' as const, url: '' }] } } }))}>追加</button>
            </div>
            {(form.metadata.mcp?.custom || []).map((s, idx) => (
              <div key={idx} className="mt-2 p-2 border rounded">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input className="border rounded p-1 text-xs" placeholder="server id" value={s.id} onChange={e => {
                    const next = [...(form.metadata.mcp?.custom || [])];
                    next[idx] = { ...next[idx], id: e.target.value };
                    setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                  }} />
                  <select className="border rounded p-1 text-xs" value={s.kind} onChange={e => {
                    const next = [...(form.metadata.mcp?.custom || [])];
                    next[idx] = { ...next[idx], kind: e.target.value as 'remote' | 'local' };
                    setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                  }}>
                    <option value="remote">remote</option>
                    <option value="local">local</option>
                  </select>
                  <button type="button" className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200" onClick={() => {
                    const next = (form.metadata.mcp?.custom || []).filter((_, i) => i !== idx);
                    setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                  }}>削除</button>
                </div>
                {s.kind === 'remote' ? (
                  <input className="border rounded p-1 text-xs w-full" placeholder="https://example.com/mcp" value={s.url || ''} onChange={e => {
                    const next = [...(form.metadata.mcp?.custom || [])];
                    next[idx] = { ...next[idx], url: e.target.value };
                    setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                  }} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded p-1 text-xs" placeholder="command" value={s.command || ''} onChange={e => {
                      const next = [...(form.metadata.mcp?.custom || [])];
                      next[idx] = { ...next[idx], command: e.target.value };
                      setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                    }} />
                    <input className="border rounded p-1 text-xs" placeholder="args (space-separated)" value={s.args || ''} onChange={e => {
                      const next = [...(form.metadata.mcp?.custom || [])];
                      next[idx] = { ...next[idx], args: e.target.value };
                      setForm(f => ({ ...f, metadata: { mcp: { ...(f.metadata.mcp || {}), custom: next } } }));
                    }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1">
          <span className="text-sm">追加プロンプト（ベースに連結されます）</span>
          <textarea className="border rounded p-2" rows={6} value={form.prompt_text} onChange={e => setForm({ ...form, prompt_text: e.target.value })} />
        </label>
        <div className="grid gap-1">
          <span className="text-sm">最終プロンプトプレビュー</span>
          <pre className="border rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs bg-gray-50 text-gray-800 dark:bg-gray-800 dark:text-gray-100">{`${basePrompt}${form.prompt_text ? `\n\n【追加指示】\n${form.prompt_text}` : ''}`}</pre>
        </div>
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

export default function EditWorkerPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <EditWorkerPageContent />
    </Suspense>
  );
}
