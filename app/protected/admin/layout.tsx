export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/60 dark:bg-gray-800/60 rounded-t-xl">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">管理コンソール</h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">設定を編集して保存すると即時反映されます</span>
        </div>
        <nav className="px-4 py-3 flex flex-wrap gap-2 text-sm">
          <a className="px-3 py-1.5 rounded-full border hover:opacity-90 bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-800/60 dark:text-white dark:border-indigo-700" href="/protected/admin/workers">ワーカー管理</a>
          <a className="px-3 py-1.5 rounded-full border hover:opacity-90 bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-800/60 dark:text-white dark:border-emerald-700" href="/protected/admin/env">環境変数</a>
        </nav>
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
