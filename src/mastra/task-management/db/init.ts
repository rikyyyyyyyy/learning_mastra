import { getTaskDB, initializeTaskManagementDB } from './migrations';

let initPromise: Promise<void> | null = null;

export async function ensureTaskDBInitialized(): Promise<void> {
  // 既に初期化済みの場合でも、進行中の初期化があれば待機する
  if (initPromise) {
    await initPromise;
    return;
  }
  if (!getTaskDB()) {
    const url = process.env.MASTRA_DB_URL || ':memory:';
    initPromise = (async () => {
      try {
        await initializeTaskManagementDB(url);
      } finally {
        // 完了後は解放
        initPromise = null;
      }
    })();
    await initPromise;
    return;
  }
  // taskDB は存在するが初期化中の可能性
  if (initPromise) {
    await initPromise;
  }
}

