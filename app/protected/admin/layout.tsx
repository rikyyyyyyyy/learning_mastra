export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/60 dark:bg-gray-800/60 rounded-t-xl">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">管理コンソール</h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">設定を編集して保存すると即時反映されます</span>
        </div>
        <nav className="px-4 py-3 flex flex-wrap gap-2 text-sm">
          <a className="px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-900/50" href="/protected/admin/agents">エージェント定義</a>
          <a className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-900/50" href="/protected/admin/networks">ネットワーク定義</a>
        </nav>
      </div>
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}

