# 🤖 Mastra AIアシスタントプラットフォーム

Next.js 15とMastraフレームワークで構築された高度なマルチモデルAIアシスタントプラットフォーム。階層型エージェントネットワーク（CEO-Manager-Worker）、分散タスク管理システム、非同期ジョブ処理、リアルタイムエージェント会話監視機能を備えた本番環境対応のシステムです。

## 📋 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [アーキテクチャ](#アーキテクチャ)
- [クイックスタート](#クイックスタート)
- [エージェントネットワークシステム](#エージェントネットワークシステム)
- [分散タスク管理システム](#分散タスク管理システム)
- [利用可能なモデル](#利用可能なモデル)
- [APIリファレンス](#apiリファレンス)
- [UI機能](#ui機能)
- [開発](#開発)
- [設定](#設定)

## 🌟 概要

このプラットフォームは、Mastraフレームワークを活用した本番環境対応のAIアシスタントシステムです：

- **マルチモデル対応**: Claude Sonnet 4、OpenAI o3、Gemini 2.5 Flashをシームレスに切り替え
- **階層型エージェントネットワーク**: 複雑なタスク委譲のためのCEO-Manager-Workerパターン
- **分散タスク管理**: Git風のタスク管理システムで複数ネットワークを並行管理
- **非同期処理**: リアルタイムステータス追跡機能を持つノンブロッキングジョブシステム
- **豊富な機能**: Web検索、天気情報、スライド生成など
- **エンタープライズ機能**: 認証、スレッドベースメモリ、構造化ログ

## ✨ 主な機能

### 🧠 マルチモデルAI統合
- **Claude Sonnet 4** (Anthropic): 高度な推論と日本語処理（デフォルト）
- **OpenAI o3**: 最新の高性能推論モデル
- **Gemini 2.5 Flash** (Google): 思考プロセスを可視化した高速レスポンス
- チャットUIでの動的モデル選択（ドロップダウンメニュー）

### 🏗️ 階層型エージェントネットワーク
- **実行フロー**: General Agent → Agent Network Tool → NewAgentNetwork（直接実行）
- **CEOエージェント**: 戦略的タスク指示と高レベル計画
- **Managerエージェント**: タスク分解と運用調整
- **Workerエージェント**: 専門ツールを使用した効率的なタスク実行
- **協調メカニズム**: 最大10回の反復でエージェント間が自律的に連携
- **リアルタイム監視**: エージェント間の会話をSSE（Server-Sent Events）で即時配信

### 🎯 分散タスク管理システム（新機能）
- **タスクレジストリ**: 実行中のタスクの登録・ステータス管理
- **成果物ストア**: タスク間での成果物共有と再利用
- **タスク間通信**: 実行中タスクへの動的な指示送信
- **依存関係管理**: タスク間の依存関係を明示的に管理
- **ネットワーク状況監視**: 全体のタスク実行状況を一元管理

### ⚡ 非同期ジョブシステム
- ツールは即座にジョブIDを返却（< 100ms）
- バックグラウンドでのエージェントネットワーク実行
- リアルタイムステータス追跡: `queued → running → completed/failed`
- 結果は`.job-results/{jobId}.json`に保存
- タスク管理DBと自動同期

### 🔍 高度な機能
- **Web検索**: Brave検索とExa MCP統合による強力な検索
- **天気情報**: リアルタイム天気データ取得
- **スライド生成**: ライブプレビュー付きHTMLベースのプレゼンテーション
- **メモリ管理**: LibSQLによるスレッドベースの会話
- **エージェントログビューア**: エージェント間の会話履歴をリアルタイムまたは後から確認
- **ジョブステータス追跡**: 非同期タスクの進行状況をリアルタイム監視

### 🔐 エンタープライズ対応
- SSRサポート付きSupabase認証
- 保護されたルートとセッション管理
- PinoLoggerによる構造化ログ
- strictモードのTypeScript

## 🏛️ アーキテクチャ

### システムアーキテクチャ（v4.0 - 分散タスク管理対応）

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   チャットUI    │     │   APIルート     │     │  Mastraコア     │
│                 │     │                 │     │                 │
│ • モデル選択    │────▶│ • /api/chat     │────▶│ • エージェント  │
│ • ストリーミング│     │ • /api/job-*    │     │ • ツール        │
│ • スレッドメモリ│     │ • 認証MW        │     │ • タスク管理    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ タスク管理DB    │     │ Agent Network   │
                        │                 │     │     Tool        │
                        │ • タスク登録    │◀────│ • 直接実行      │
                        │ • 成果物保存    │     │ • NewAgentNetwork│
                        │ • メッセージング│     │ • エージェント協調│
                        │ • 依存関係管理  │     └─────────────────┘
                        └─────────────────┘
```

### ディレクトリ構造

```
/
├── app/                    # Next.js App Router
│   ├── api/               # APIエンドポイント
│   │   ├── chat/         # メインチャットエンドポイント
│   │   ├── job-result/   # ジョブ結果取得
│   │   └── agent-logs/   # エージェントログ（履歴＆ストリーミング）
│   ├── auth/             # 認証ページ
│   └── protected/        # 保護されたルート
│       └── chat/         # チャットインターフェース
├── components/            # Reactコンポーネント
│   └── ui/               # shadcn/uiコンポーネント
├── src/mastra/           # Mastra設定
│   ├── agents/           # AIエージェント
│   │   └── network/      # CEO、Manager、Worker
│   ├── tools/            # Mastraツール
│   │   ├── agent-network-tool.ts  # エージェントネットワーク実装
│   │   ├── job-status-tool.ts     # ジョブ管理
│   │   └── slide-preview-tool.ts  # スライドプレビュー
│   ├── task-management/  # 分散タスク管理システム
│   │   ├── db/          # データベース層
│   │   │   ├── schema.ts    # テーブル定義
│   │   │   ├── migrations.ts # マイグレーション
│   │   │   └── dao.ts       # データアクセス層
│   │   └── tools/       # タスク管理ツール
│   │       ├── task-registry-tool.ts     # タスク登録・管理
│   │       ├── artifact-store-tool.ts    # 成果物管理
│   │       ├── task-communication-tool.ts # タスク間通信
│   │       └── task-discovery-tool.ts    # タスク検索・依存管理
│   ├── prompts/          # エージェントプロンプト（日本語）
│   │   └── agent-prompts.ts  # 全エージェントのプロンプト一元管理
│   ├── utils/            # ユーティリティ
│   └── index.ts          # Mastra設定
├── lib/                  # 共有ライブラリ
├── .job-results/         # 非同期ジョブ結果
└── .agent-network-logs/  # エージェント会話ログ
```

## 🚀 クイックスタート

### 前提条件

- Node.js 18以上
- npmまたはpnpm
- AIプロバイダーのAPIキー

### インストール

1. **リポジトリをクローン**
   ```bash
   git clone <repository-url>
   cd learning_mastra
   ```

2. **依存関係をインストール**
   ```bash
   pnpm install
   # または
   npm install
   ```

3. **環境変数を設定**
   
   `.env.local.example`を`.env.local`にコピー：
   ```env
   # AIプロバイダーキー
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
   
   # Supabase認証
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # 検索統合
   EXA_API_KEY=your_exa_key
   
   # デバッグ（オプション）
   LOG_LEVEL=debug
   AGENT_NETWORK_DEBUG=true
   ```

4. **開発サーバーを起動**
   ```bash
   npm run dev
   ```

5. **アプリケーションにアクセス**
   - http://localhost:3000 を開く
   - サインアップまたはログイン
   - チャットインターフェースに移動

## 🤝 エージェントネットワークシステム

### ネットワークアーキテクチャ

プラットフォームは洗練されたCEO-Manager-Workerパターンを実装：

```
ユーザーリクエスト
     │
     ▼
General Agent（タスク管理ツール使用可能）
     │
     ├─▶ taskRegistryTool（タスク登録）
     ├─▶ agentNetworkTool（ネットワーク起動）
     │
     ▼（バックグラウンド実行）
NewAgentNetwork作成
     │
     ├─▶ CEOエージェント
     │   • タスク分析と戦略立案
     │   • taskDiscoveryTool（関連タスク検索）
     │   • taskCommunicationTool（戦略的指示送信）
     │
     ├─▶ Managerエージェント
     │   • 詳細計画作成とタスク分解
     │   • taskRegistryTool（サブタスク登録）
     │   • artifactStoreTool（成果物確認）
     │   • taskDiscoveryTool（依存関係管理）
     │
     └─▶ Workerエージェント
         • 具体的なタスク実行
         • exaMCPSearchTool（Web検索）
         • artifactStoreTool（成果物保存）
         • taskCommunicationTool（追加指示受信）
```

### タスクフロー

1. **ユーザーリクエスト**: チャットUI経由でGeneral Agentに送信
2. **タスク分析**: General Agentがタスクタイプとパラメータを決定
3. **タスク登録**: タスク管理DBに登録（jobIdをtask_idとして使用）
4. **ネットワーク起動**: Agent Network Toolが即座にジョブIDを返却
5. **協調実行**: CEO→Manager→Workerの階層で自律的に実行
6. **成果物保存**: 完了後、結果と成果物を保存

## 🗂️ 分散タスク管理システム

### データベーススキーマ

システムは4つの主要テーブルで構成：

#### network_tasks（タスク管理）
- `task_id`: タスク識別子（jobIdと同じ）
- `status`: queued/running/completed/failed/paused
- `task_type`: web-search/slide-generation等
- `priority`: low/medium/high
- `metadata`: 追加メタデータ

#### task_artifacts（成果物管理）
- `artifact_id`: 成果物識別子
- `task_id`: 関連タスクID
- `artifact_type`: html/json/text等
- `content`: 成果物の内容
- `is_public`: 他タスクからのアクセス可否

#### task_communications（タスク間通信）
- `message_id`: メッセージ識別子
- `from_task_id`/`to_task_id`: 送信元/送信先タスク
- `message_type`: instruction/request/response/update
- `content`: メッセージ内容

#### task_dependencies（依存関係）
- `dependency_id`: 依存関係識別子
- `task_id`: タスクID
- `depends_on_task_id`: 依存先タスクID
- `dependency_type`: requires_completion/uses_artifact/parallel

### タスク管理ツール

#### Task Registry Tool
```typescript
// タスクの登録
taskRegistryTool({
  action: 'register',
  taskData: {
    taskType: 'slide-generation',
    taskDescription: 'AIに関するプレゼンテーション作成',
    createdBy: 'general-agent',
    priority: 'high'
  }
})

// 実行中タスクの確認
taskRegistryTool({
  action: 'list_running'
})
```

#### Artifact Store Tool
```typescript
// 成果物の保存
artifactStoreTool({
  action: 'store',
  taskId: 'task-123',
  artifactData: {
    artifactType: 'html',
    content: '<html>...</html>',
    isPublic: true
  }
})

// 他タスクの成果物を取得
artifactStoreTool({
  action: 'retrieve',
  artifactId: 'artifact-456'
})
```

#### Task Communication Tool
```typescript
// タスクへメッセージ送信
taskCommunicationTool({
  action: 'send',
  messageData: {
    toTaskId: 'task-123',
    fromAgentId: 'manager-agent',
    messageType: 'instruction',
    content: '追加要件: グラフを含めてください'
  }
})

// 未読メッセージの受信
taskCommunicationTool({
  action: 'receive_unread',
  taskId: 'task-123'
})
```

#### Task Discovery Tool
```typescript
// 関連タスクの検索
taskDiscoveryTool({
  action: 'find_related',
  taskId: 'current-task-id'
})

// ネットワーク全体の状況確認
taskDiscoveryTool({
  action: 'get_network_status'
})
```

### 使用例：複数タスクの並行実行

```typescript
// 例：スライド作成とWeb検索を並行実行
// 1. General Agentが両方のタスクを開始
const slideJobId = await agentNetworkTool({
  taskType: 'slide-generation',
  taskDescription: 'AIの最新動向に関するスライド',
  taskParameters: { topic: 'AI Advances 2024', pages: 10 }
});

const searchJobId = await agentNetworkTool({
  taskType: 'web-search',
  taskDescription: '最新のAIニュース検索',
  taskParameters: { query: 'AI breakthroughs 2024' }
});

// 2. スライド作成タスクが検索結果を利用
taskCommunicationTool({
  action: 'send',
  messageData: {
    fromTaskId: searchJobId,
    toTaskId: slideJobId,
    content: '検索結果: [最新のAI情報...]'
  }
});

// 3. 成果物の共有
artifactStoreTool({
  action: 'store',
  taskId: searchJobId,
  artifactData: {
    artifactType: 'json',
    content: JSON.stringify(searchResults),
    isPublic: true
  }
});
```

## 🎯 利用可能なモデル

### Claude Sonnet 4（デフォルト）
- **プロバイダー**: Anthropic
- **モデルID**: `claude-sonnet-4-20250514`
- **最適な用途**: 複雑な推論、分析、創造的タスク、日本語処理
- **使用場所**: 全エージェント（General、CEO、Manager、Worker）

### OpenAI o3
- **プロバイダー**: OpenAI
- **モデルID**: `o3-2025-04-16`
- **最適な用途**: 高性能推論タスク

### Gemini 2.5 Flash
- **プロバイダー**: Google
- **モデルID**: `gemini-2.5-flash`
- **最適な用途**: 高速レスポンス、コスト効率

## 📡 APIリファレンス

### POST /api/chat

ストリーミングサポート付きメインチャットエンドポイント。

**リクエスト:**
```json
{
  "message": "最新のAIニュースを検索して",
  "threadId": "optional-thread-id",
  "model": "claude-sonnet-4"
}
```

### GET /api/job-result/[jobId]

非同期ジョブの結果を取得。

### GET /api/agent-logs/[jobId]

エージェント会話履歴を取得。

### GET /api/agent-logs/stream/[jobId]

Server-Sent Eventsによるリアルタイムログストリーミング。

## 💻 UI機能

### チャットインターフェース
- **モデル選択**: AIモデルを切り替えるドロップダウン
- **ストリーミングレスポンス**: リアルタイムメッセージ更新
- **ツール可視化**: ツール使用時の表示
- **スレッド管理**: 会話履歴の管理
- **ダークモード**: 完全なダークモードサポート

### 特別な機能
- **スライドプレビュー**: 生成されたスライドの自動HTMLプレビュー
- **エージェントログビューア**: リアルタイム会話監視
- **タスクステータス表示**: 実行中タスクの状況確認
- **進捗インジケーター**: 長時間タスクの視覚的フィードバック

## 🛠️ 開発

### コマンド

```bash
npm run dev        # Turbopackで開発サーバーを起動
npm run build      # プロダクションビルド
npm run start      # プロダクションサーバーを起動
npm run lint       # ESLintを実行
```

### エージェントプロンプトの編集

全エージェントのプロンプトは`/src/mastra/prompts/agent-prompts.ts`で一元管理：

```typescript
export const AGENT_PROMPTS = {
  GENERAL_AGENT: `...`,  // General Agentのプロンプト（日本語）
  CEO_AGENT: `...`,       // CEO Agentのプロンプト（日本語）
  MANAGER_AGENT: `...`,   // Manager Agentのプロンプト（日本語）
  WORKER_AGENT: `...`     // Worker Agentのプロンプト（日本語）
}
```

### 新機能の追加

#### 新しいツールを追加
1. `/src/mastra/tools/`にツールを作成
2. ジョブキューイングパターンを実装（< 100ms応答）
3. `/src/mastra/index.ts`に登録
4. 関連するエージェントに追加

#### 新しいエージェントを追加
1. `/src/mastra/agents/`にエージェントファイルを作成
2. `/src/mastra/prompts/agent-prompts.ts`にプロンプトを追加
3. `/src/mastra/index.ts`に登録

### テスト

タスク管理システムのテスト：
```bash
npx tsx src/mastra/task-management/test-task-management.ts
```

## ⚙️ 設定

### データベース設定
- **タスク管理DB**: LibSQL（SQLite）ベース、インメモリ実行
- **永続化**: `file:./mastra.db`に変更可能

### ログ設定
```env
LOG_LEVEL=debug
AGENT_NETWORK_DEBUG=true
```

## 🔧 トラブルシューティング

### よくある問題

1. **タスクが見つからない**
   - タスク管理DBへの登録が完了しているか確認
   - jobIdとtask_idの一致を確認

2. **成果物にアクセスできない**
   - `is_public`フラグを確認
   - タスクの権限を確認

3. **タスク間通信が届かない**
   - 送信先タスクIDの正確性を確認
   - メッセージタイプの適切性を確認

## 🚀 最近の更新

### v4.0.0 - 分散タスク管理システム
- 🗂️ Git風の分散タスク管理システムを実装
- 📦 4つのタスク管理ツールを追加
- 🔄 タスク間での成果物共有機能
- 💬 実行中タスクへの動的指示送信
- 🔗 タスク依存関係の明示的管理
- 📝 全エージェントプロンプトを日本語化・一元管理
- 🎯 複数エージェントネットワークの並行実行対応

### v3.0.0 - アーキテクチャの簡素化
- 🏗️ ワークフロー層を削除し、エージェントネットワークを直接ツールとして実装
- ⚡ パフォーマンス向上

---

*Next.js 15、Mastra、最先端のAIモデルを使用して構築されました ❤️*