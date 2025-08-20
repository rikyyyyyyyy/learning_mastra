# 🤖 Mastra AIエージェントネットワークプラットフォーム

次世代の分散型AIエージェント管理プラットフォーム。階層型エージェントネットワーク（CEO-Manager-Worker）、コンテンツアドレス指定ストレージ（CAS）、リアルタイム制御機能を備えた本番環境対応システムです。

## 📋 目次

- [概要](#概要)
- [システムアーキテクチャ](#システムアーキテクチャ)
- [プロジェクト構造詳細](#プロジェクト構造詳細)
- [src/mastraディレクトリ詳細解説](#srcmastraディレクトリ詳細解説)
- [データベース設計](#データベース設計)
- [主要機能](#主要機能)
- [クイックスタート](#クイックスタート)
- [開発ガイド](#開発ガイド)
- [APIリファレンス](#apiリファレンス)
- [トラブルシューティング](#トラブルシューティング)

## 🌟 概要

本プラットフォームは、Mastraフレームワークを基盤とした高度なAIエージェント管理システムです。複雑なタスクを自律的に分解・実行し、リアルタイムで監視・制御できる分散型アーキテクチャを採用しています。

### 主要な特徴

- **階層型エージェントネットワーク**: CEO-Manager-Workerパターンによる自律的タスク処理
- **分散タスク管理システム**: Git風のコンテンツアドレス指定ストレージによる効率的なデータ管理
- **動的エージェント生成**: Agent Factoryパターンによる柔軟なエージェント作成
- **マルチモデル対応**: Claude Sonnet 4、GPT-5、OpenAI o3、Gemini 2.5 Flash
- **リアルタイム制御**: ディレクティブシステムによる実行中タスクへの動的介入
- **エンタープライズ機能**: 認証、監査ログ、管理コンソール

## 🏛️ システムアーキテクチャ

### アーキテクチャ概要図

```
┌─────────────────────────────────────────────────────────────┐
│                     ユーザーインターフェース層               │
├─────────────────┬─────────────────┬────────────────────────┤
│  チャットUI      │  管理コンソール  │  DBビューアー         │
│  /protected/chat │  /protected/admin│  /api/db-viewer/*    │
└─────────────────┴─────────────────┴────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                        APIルート層                           │
├─────────────────┬─────────────────┬────────────────────────┤
│  /api/chat      │  /api/admin/*    │  /api/agent-logs/*    │
│  ストリーミング  │  CRUD操作        │  SSEログ配信          │
└─────────────────┴─────────────────┴────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Mastraコア層                            │
├─────────────────┬─────────────────┬────────────────────────┤
│  エージェント    │  ツール群        │  メモリ管理           │
│  Factory        │  Registry        │  LibSQL              │
└─────────────────┴─────────────────┴────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                   エージェントネットワーク層                  │
├─────────────────┬─────────────────┬────────────────────────┤
│  CEOエージェント │  Managerエージェント│  Workerエージェント  │
│  戦略立案       │  タスク分解       │  実行               │
└─────────────────┴─────────────────┴────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     データ永続化層                           │
├─────────────────┬─────────────────┬────────────────────────┤
│  タスクDB       │  コンテンツCAS    │  ジョブストア         │
│  12テーブル     │  SHA-256索引     │  .job-results/       │
└─────────────────┴─────────────────┴────────────────────────┘
```

### 処理フロー

1. **ユーザーリクエスト** → General Agent
2. **タスク分析** → Agent Networkツール起動
3. **戦略立案** → CEOエージェント（ポリシー設定）
4. **タスク分解** → Managerエージェント（サブタスク生成）
5. **実行** → Workerエージェント（専門ツール使用）
6. **結果統合** → CEOエージェント（最終レビュー）

## 📁 プロジェクト構造詳細

```
learning_mastra/
├── src/                        # ソースコード（詳細は後述）
│   ├── mastra/                # Mastraフレームワーク設定
│   └── types/                 # 共通型定義
├── app/                       # Next.js App Router
│   ├── api/                   # APIエンドポイント
│   ├── auth/                  # 認証ページ
│   └── protected/             # 認証済みルート
├── components/                # Reactコンポーネント
│   ├── ui/                    # shadcn/uiコンポーネント
│   └── db-viewers/            # DB監視コンポーネント
├── lib/                       # ユーティリティ
│   └── utils.ts              # 共通ヘルパー関数
├── public/                    # 静的アセット
├── .job-results/             # 非同期ジョブ結果
└── 設定ファイル群
    ├── package.json          # 依存関係とスクリプト
    ├── tsconfig.json         # TypeScript設定
    ├── next.config.ts        # Next.js設定
    └── tailwind.config.ts    # Tailwind CSS設定
```

## 📚 src/mastraディレクトリ詳細解説

### 1. コア設定ファイル

#### `/src/mastra/index.ts`
**役割**: Mastraフレームワークの中央設定ハブ
```typescript
// 主要な機能:
- Mastraインスタンスの初期化
- LibSQL（インメモリ）ストレージ設定
- PinoLoggerの設定（デバッグレベル制御）
- タスク管理DBの初期化
- 全エージェントとツールのエクスポート
```

#### `/src/mastra/shared-memory.ts`
**役割**: スレッドベースの会話メモリ管理
```typescript
// 主要な機能:
- LibSQLストアを使用したメモリインスタンス作成
- 10メッセージの作業メモリ設定
- 日本語テンプレートによるユーザー情報管理
```

### 2. エージェントシステム（/src/mastra/agents/）

#### `/src/mastra/agents/factory.ts`
**役割**: 動的エージェント生成システム
```typescript
// 主要関数:
createRoleAgent(params): 役割ベースのエージェント作成
createAgentFromDefinition(def): DB定義からエージェント生成
// 設計パターン:
- ファクトリーパターンによる一貫性のあるエージェント生成
- 動的なモデル・ツール・プロンプト設定
```

#### `/src/mastra/agents/general-agent.ts`
**役割**: メインエントリーポイントエージェント
```typescript
// 主要機能:
- 動的モデル切り替え（Claude/GPT/Gemini）
- ツールモードフィルタリング（network/workflow/both）
- システムコンテキスト統合（時刻、環境情報）
```

#### `/src/mastra/agents/network/`
階層型エージェントネットワークの実装:

- **`ceo-agent.ts`**: 戦略立案、ポリシー管理、最終統合
- **`manager-agent.ts`**: タスク分解、サブタスク調整、品質レビュー
- **`worker-agent.ts`**: 専門ツールによるタスク実行

### 3. 設定管理（/src/mastra/config/）

#### `/src/mastra/config/model-registry.ts`
**役割**: AIモデルの中央管理
```typescript
// サポートモデル:
- Claude Sonnet 4 (claude-sonnet-4-20250514)
- GPT-5 (gpt-5)
- OpenAI o3 (o3-2025-04-16)
- Gemini 2.5 Flash (gemini-2.5-flash)
// 主要関数:
resolveModel(modelKey): モデルインスタンスとメタデータ返却
```

#### `/src/mastra/config/tool-registry.ts`
**役割**: 役割ベースのツール割り当て
```typescript
// ツールセット定義:
GENERAL: タスク管理、ネットワーク実行ツール
CEO: ポリシー管理、タスクビューア
MANAGER: バッチ作成、ディレクティブ管理
WORKER: 検索、ドキュメント読み込み、スライド生成
```

### 4. プロンプト管理（/src/mastra/prompts/）

#### `/src/mastra/prompts/agent-prompts.ts`
**役割**: 日本語プロンプトの中央管理
```typescript
// 主要機能:
getAgentPrompt(role): 役割別プロンプト取得
buildPromptWithContext(): システム情報注入
// 設計思想:
- 全プロンプトを日本語で統一
- 環境情報の自動注入
- 厳格なツール使用ルール
```

### 5. タスク管理システム（/src/mastra/task-management/）

#### データベース層（/db/）

- **`schema.ts`**: Zodスキーマによる型安全なDB定義
- **`migrations.ts`**: DBマイグレーション管理
- **`dao.ts`**: Data Access Objectパターン実装
- **`cas-dao.ts`**: コンテンツアドレス指定ストレージDAO
- **`init.ts`**: DB初期化処理

#### ツール群（/tools/）

- **`task-registry-tool.ts`**: タスク登録・状態管理
- **`batch-task-creation-tool.ts`**: 複数タスク一括作成
- **`directive-management-tool.ts`**: 実行中タスクへの指令送信
- **`policy-management-tool.ts`**: CEO戦略ポリシー管理
- **`task-viewer-tool.ts`**: タスク監視・サマリー生成
- **`content-store-tool.ts`**: CAS操作
- **`artifact-io-tool.ts`**: バージョン管理付きアーティファクト
- **`artifact-diff-tool.ts`**: リビジョン間差分生成
- **`final-result-tool.ts`**: 最終結果保存

### 6. ツール（/src/mastra/tools/）

#### `/src/mastra/tools/agent-network-tool.ts`
**役割**: 階層型エージェントネットワーク実行エンジン
```typescript
// 主要機能:
- CEO-Manager-Worker協調オーケストレーション
- ストリーミング実行とリアルタイムログ
- 分散システムへのタスク登録
- 包括的エラーハンドリング
// 設計制約:
- 100ms以内の応答（バックグラウンド処理使用）
```

#### `/src/mastra/tools/docs-reader-tool.ts`
**役割**: ドキュメント読み込みと解析

#### `/src/mastra/tools/exa-search-wrapper.ts`
**役割**: EXA MCP検索統合

#### `/src/mastra/tools/slide-preview-tool.ts`
**役割**: インタラクティブスライド生成

### 7. ユーティリティ（/src/mastra/utils/）

#### `/src/mastra/utils/agent-log-store.ts`
**役割**: イベント駆動型ログ管理
```typescript
// 主要機能:
- EventEmitterベースのリアルタイム配信
- ジョブライフサイクル管理
- 自動メモリクリーンアップ
- SSE統合
```

#### `/src/mastra/utils/shared-context.ts`
**役割**: システム全体のコンテキスト管理
```typescript
// 主要関数:
getSystemContext(): 環境データ収集
formatSystemContext(): 日本語フォーマッティング
injectSystemContext(): RuntimeContext統合
```

#### `/src/mastra/utils/errors.ts`
**役割**: カスタムエラークラス定義

### 8. サービス層（/src/mastra/services/）

#### `/src/mastra/services/log-bus.ts`
**役割**: マルチシンクログ配信
```typescript
// コンポーネント:
- ConsoleSink: 開発用コンソール出力
- DbSink: SQLite永続化
- LogBus: イベント配信システム
```

#### `/src/mastra/services/job-store.ts`
**役割**: 非同期ジョブ結果管理

### 9. MCP統合（/src/mastra/mcp/）

#### `/src/mastra/mcp/exa-mcp-client.ts`
**役割**: EXA検索MCP統合
```typescript
// 主要機能:
- シングルトンクライアント管理
- リモートMCPサーバー接続
- APIキー管理とエラーハンドリング
```

### 10. ワークフロー（/src/mastra/workflows/）

#### `/src/mastra/workflows/task-workflow-v2.ts`
**役割**: リニアワークフロー実行パス
```typescript
// ステップ:
1. CEOポリシー決定と保存
2. Managerプランニング（ディレクティブ統合）
3. Worker実行（品質レビューループ）
4. CEO最終結果統合
```

## 💾 データベース設計

### テーブル構造（12テーブル）

#### タスク管理テーブル
```sql
-- network_tasks: メインタスク管理
CREATE TABLE network_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT,
  task_description TEXT,
  status TEXT, -- pending/in_progress/completed/failed
  priority TEXT, -- low/medium/high/critical
  parent_task_id TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

-- network_directives: 追加指令システム
CREATE TABLE network_directives (
  id TEXT PRIMARY KEY,
  network_id TEXT,
  content TEXT,
  type TEXT, -- policy_update/task_addition/priority_change/abort
  status TEXT, -- pending/acknowledged/applied/rejected
  source TEXT
);
```

#### コンテンツ管理テーブル
```sql
-- content_store: SHA-256インデックス付きストレージ
CREATE TABLE content_store (
  hash TEXT PRIMARY KEY,
  content TEXT,
  content_type TEXT,
  size INTEGER,
  created_at DATETIME
);

-- artifacts: タスクアーティファクト
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  mime_type TEXT,
  current_revision_id TEXT
);

-- artifact_revisions: Git風バージョン管理
CREATE TABLE artifact_revisions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT,
  content_hash TEXT,
  parent_revision_id TEXT,
  commit_message TEXT,
  author TEXT
);
```

## 🚀 主要機能

### 1. 階層型エージェントネットワーク

```typescript
// 実行例
const result = await agentNetworkTool.execute({
  context: {
    input: "市場分析レポートを作成",
    jobId: "job-123",
    modelKey: "claude-sonnet-4"
  }
});
```

### 2. ディレクティブシステム

```typescript
// 実行中タスクへの指令送信
await directiveManagementTool.execute({
  context: {
    action: 'create_directive',
    networkId: 'network-123',
    directiveData: {
      content: '品質基準を上げて詳細な分析を追加',
      type: 'policy_update',
      source: 'general-agent'
    }
  }
});
```

### 3. コンテンツアドレス指定ストレージ（CAS）

```typescript
// コンテンツの保存と参照
const { hash } = await contentStoreTool.execute({
  context: {
    action: 'store',
    content: htmlContent,
    contentType: 'text/html'
  }
});
// 参照: ref:${hash}
```

### 4. バッチタスク処理

```typescript
// 複数タスクの一括作成
await batchTaskCreationTool.execute({
  context: {
    action: 'create_batch',
    networkId: 'network-123',
    tasks: [
      { task_type: 'research', task_description: '競合分析' },
      { task_type: 'analysis', task_description: 'SWOT分析' }
    ]
  }
});
```

## 🛠️ クイックスタート

### 前提条件

- Node.js 18以上
- pnpm推奨（npmも可）
- 各AIプロバイダーのAPIキー

### インストール手順

1. **リポジトリのクローン**
```bash
git clone <repository-url>
cd learning_mastra
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
`.env.local`ファイルを作成:
```env
# AI Provider Keys (必須)
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Supabase Auth (必須)
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# Optional
EXA_API_KEY=your_key
LOG_LEVEL=debug
AGENT_NETWORK_DEBUG=true
```

4. **開発サーバーの起動**
```bash
npm run dev
```

5. **アクセス**
- http://localhost:3000
- サインアップ/ログイン
- `/protected/chat`: チャットインターフェース
- `/protected/admin`: 管理コンソール

## 👨‍💻 開発ガイド

### 開発コマンド

```bash
npm run dev        # 開発サーバー（Turbopack）
npm run build      # プロダクションビルド
npm run start      # プロダクションサーバー
npm run lint       # ESLint実行
```

### テストコマンド

```bash
# タスク管理システムのテスト
npx tsx src/mastra/task-management/test-task-management.ts

# アーティファクトシステムのテスト
npx tsx src/mastra/task-management/test-artifact-system.ts

# タスクシステムのテスト
npx tsx src/mastra/task-management/test-task-system.ts
```

### 新しいツールの追加

1. `/src/mastra/tools/`に新しいツールファイルを作成
2. 100ms以内の応答時間を守る（バックグラウンド処理使用）
3. `/src/mastra/config/tool-registry.ts`に登録
4. 適切な役割のツールセットに追加
5. `/src/mastra/index.ts`のtools objectに追加

### 新しいエージェントの追加

**オプション1: 管理コンソール使用（推奨）**
1. `/protected/admin/agents/`にアクセス
2. 「新規エージェント作成」をクリック
3. 必要情報を入力して保存

**オプション2: プログラマティック作成**
1. `/src/mastra/agents/`に新しいエージェントファイル作成
2. `/src/mastra/prompts/agent-prompts.ts`にプロンプト追加
3. `/src/mastra/index.ts`に登録

### アーキテクチャ原則

1. **100ms応答ルール**: 全ツールは100ms以内に応答
2. **日本語ファースト**: 全ユーザー向けテキストは日本語
3. **型安全性**: Zodスキーマによる包括的な型定義
4. **イベント駆動**: EventEmitterパターンによるリアルタイム性
5. **循環依存回避**: 動的インポートの積極活用

## 📡 APIリファレンス

### チャットAPI
```typescript
POST /api/chat
// ストリーミング対応のメインチャットエンドポイント
// Body: { messages, threadId, modelKey }
```

### 管理API
```typescript
GET/POST /api/admin/agents    // エージェント定義管理
GET/POST /api/admin/networks  // ネットワーク構成
GET/POST /api/admin/models    // モデル設定
GET /api/admin/tools          // 利用可能ツール一覧
```

### モニタリングAPI
```typescript
GET /api/agent-logs/stream/[jobId]  // SSEリアルタイムログ
GET /api/job-result/[jobId]         // ジョブ結果取得
GET /api/db-viewer/tasks            // タスク実行監視
GET /api/db-viewer/directives       // ディレクティブ状態
```

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. エージェントが見つからない
- 管理コンソールでエージェント定義を確認
- ネットワーク定義のエージェントIDをチェック
- `/src/mastra/index.ts`での登録を確認

#### 2. ディレクティブが適用されない
- Manager AgentがチェックしているかDB Viewerで確認
- ディレクティブのステータスを確認
- ネットワークIDが正しいことを確認

#### 3. タスクがタイムアウトする
- 100msルールの遵守を確認
- バックグラウンド処理の実装を確認
- ジョブステータスをチェック

#### 4. メモリ使用量が増加
- agent-log-storeの自動クリーンアップを確認
- LibSQLのインメモリ設定を確認
- 長時間実行タスクのメモリリークをチェック

### デバッグ方法

```bash
# 環境変数でデバッグモード有効化
LOG_LEVEL=debug
AGENT_NETWORK_DEBUG=true

# リアルタイムログの確認
curl http://localhost:3000/api/agent-logs/stream/[jobId]

# DB状態の確認
curl http://localhost:3000/api/db-viewer/tasks
```

## 🚀 最近の更新

### v5.0.0 - エンタープライズ機能強化
- 🏭 Agent Factoryパターンによる動的エージェント生成
- 🎛️ 管理コンソールによる完全なCRUD操作
- 📊 モデル・ツールレジストリによる中央管理
- 🗄️ コンテンツアドレス指定ストレージ（CAS）実装
- 📝 ディレクティブ・ポリシー管理システム
- 🔍 包括的なDB監視ツール

### v4.0.0 - 分散タスク管理
- 🗂️ Git風の分散タスク管理システム
- 📦 アーティファクトバージョン管理
- 🔄 タスク間成果物共有機能
- ⚡ パフォーマンス最適化

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📞 サポート

- GitHub Issues: バグ報告と機能リクエスト
- Documentation: `/docs`ディレクトリ参照
- Community: Discussionsタブ

---

*Built with ❤️ using Next.js 15, Mastra Framework, and cutting-edge AI models*