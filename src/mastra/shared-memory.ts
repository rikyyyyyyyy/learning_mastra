import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

// 共通のMemoryインスタンスを作成
export const sharedMemory = new Memory({
  storage: new LibSQLStore({
    url: ':memory:', // メモリ内ストレージを使用（開発環境用）
  }),
  options: {
    lastMessages: 10, // 直近の10メッセージを保持
    workingMemory: {
      enabled: true,
      template: `
# ユーザー情報
- 名前:
- 好み:
- 現在の話題:
- 重要な情報:
`,
    },
  },
}); 