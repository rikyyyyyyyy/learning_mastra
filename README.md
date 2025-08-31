# 🤖 Mastra AIエージェントネットワークプラットフォーム

Next.js 15とMastraフレームワークで構築された次世代AIエージェント管理プラットフォーム。動的エージェント生成、階層型ネットワーク管理、リアルタイム制御機能を備えた本番環境対応のシステムです。

## 📋 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [アーキテクチャ](#アーキテクチャ)
- [クイックスタート](#クイックスタート)
- [管理コンソール](#管理コンソール)
- [エージェントネットワークシステム](#エージェントネットワークシステム)
- [タスク管理システム](#タスク管理システム)
- [利用可能なモデル](#利用可能なモデル)
- [APIリファレンス](#apiリファレンス)
- [開発](#開発)

## 🌟 概要

このプラットフォームは、Mastraフレームワークを活用した最先端のAIエージェント管理システムです：

- **動的エージェント生成**: 管理コンソールからエージェントとネットワークを動的に定義・管理
- **マルチモデル対応**: GPT-5、Claude Sonnet 4、OpenAI o3、Gemini 2.5 Flashを動的切り替え
- **階層型エージェントネットワーク**: CEO-Manager-Workerパターンで複雑なタスクを自律的に処理
- **高度なタスク管理**: ディレクティブ（指令）、ポリシー、バッチ処理による精密な制御
- **リアルタイム監視**: タスク実行状況とエージェント会話をリアルタイムで監視
- **エンタープライズ対応**: 認証、メモリ管理、構造化ログによる本番環境対応

## ✨ 主な機能

### 🎛️ 管理コンソール（現状）
- **ワーカー管理**: Worker定義の一覧/作成/編集（MCP設定含む）
- **環境変数**: 一部キーの閲覧/更新（安全にマスク処理）

注: 以前の記述にあった「エージェント定義管理」「ネットワーク定義管理」「ツール割り当てUI」は現状コンソールでは提供していません（API/DBでは管理可能）。

### 🧠 マルチモデルAI統合
- **GPT-5** (OpenAI): 最新の次世代言語モデル（新規追加）
- **Claude Sonnet 4** (Anthropic): 高度な推論と日本語処理（デフォルト）
- **OpenAI o3**: 高性能推論モデル
- **Gemini 2.5 Flash** (Google): 高速レスポンスと思考プロセスの可視化

### 🏗️ エージェントファクトリーシステム（新規追加）
- **動的エージェント生成**: `AgentFactory`による柔軟なエージェント作成
- **モデルレジストリ**: 中央集約型のモデル管理
- **ツールレジストリ**: 役割ベースのツール自動割り当て
- **カスタムプロンプト**: エージェントごとのプロンプトカスタマイズ

### 🎯 高度なタスク管理システム
- **ディレクティブ管理**: 実行中タスクへの追加指令送信
- **ポリシー管理**: CEOエージェントによる戦略的方針設定
- **バッチタスク作成**: 複数タスクの一括生成と管理
- **タスクビューア**: 実行状況の詳細モニタリング
- **依存関係管理**: タスク間の依存関係を明示的に制御

### ⚡ 非同期ジョブシステム
- ツールは即座にジョブIDを返却（< 100ms）
- バックグラウンドでのエージェントネットワーク実行
- リアルタイムステータス追跡: `queued → running → completed/failed`
- 結果は`.job-results/{jobId}.json`に永続化

### 🔍 専門ツール（実装済み一覧・詳細）
- `workflow-orchestrator`:
  - 概要: Generalエージェントから起動し、Mastraワークフロー（`ceo-manager-worker-workflow`）をバックグラウンド実行に載せるオーケストレータ。
  - 入力: `{ taskType: 'web-search'|'slide-generation'|'weather'|'other', taskDescription: string, taskParameters?: object, context?: { constraints?, expectedOutput?, additionalInstructions? } }`
  - 出力: `{ jobId, status: 'queued', taskType, message, estimatedTime }`
  - 備考: 実行は非同期。ジョブ状態と結果は`job-status-check`/`job-result-fetch`で追跡。
- `job-status-check`:
  - 概要: ジョブ状態の確認（DBベース: `queued|running|completed|failed`）。
  - 入力: `{ jobId }` / 出力: `{ jobId, status, message, error?, startedAt?, completedAt? }`
- `job-result-fetch`:
  - 概要: ジョブ最終結果の取得（DB優先、フォールバックで`.job-results/*.json`）。
  - 入出力: `{ jobId } → { found, result, success?, taskType?, artifactText?, artifactHtml?, completedAt?, workflowId?, message }`
- `slide-preview-display`:
  - 概要: スライド生成ジョブのHTMLを検出し、UIのプレビュー表示をトリガー。
  - 入出力: `{ jobId } → { previewReady, debugInfo? }`
- `docs-reader`:
  - 概要: `docs/`配下のルールドキュメント等を読み取り、任意範囲を抽出。
  - 入力: `{ path, startMarker?, endMarker?, maxChars? }` / 出力: `{ content, from, truncated }`
- `exa-mcp-search`:
  - 概要: MCP経由でExaのリモートMCPサーバーに接続し、高度なWeb/論文/GitHub等の検索を実行。
  - 入力: `{ query, numResults?, searchType?: 'web'|'research_paper'|'github'|'company'|'linkedin'|'wikipedia' }`
  - 出力: `{ searchResults: string, success: boolean, toolUsed?: string }`
  - 必須: `EXA_API_KEY`（`.env.local`）。
- `task-registry`:
  - 概要: 分散タスク管理レイヤの最小登録/状態管理（小タスク登録・状態更新・一覧）。
  - アクション: `register|update_status|get_status|list_running|get_task`
- `directive-management`:
  - 概要: General→Manager間の追加指令（ディレクティブ）作成・承認・適用。
  - アクション: `create_directive|check_directives|get_directive|acknowledge_directive|apply_directive|reject_directive|has_pending_directives`
- `task-management`（Manager向け中核）:
  - 概要: 小タスクの作成、進捗/結果更新、割当、次タスク取得等の厳格制御。
  - アクション: `create_task|update_status|update_progress|update_result|assign_worker|get_task|list_network_tasks|get_network_summary|get_pending_tasks|get_next_task|delete_tasks_from_step|complete_task`
- `batch-task-creation`（Manager）:
  - 概要: 複数小タスクを一括作成（ステップ番号の衝突回避/再割当、依存関係・メタデータ付与）。
- `policy-management`（CEO）/`policy-check`（Manager）:
  - 概要: ネットワーク方針の保存・更新・確認。ステージ管理（`initialized→policy_set→planning→executing→finalizing→completed`）と整合。
- `task-viewer`（CEO）:
  - 概要: 完了済み小タスクの結果閲覧・ネットワークサマリ取得（読み取り専用）。
- `subtask-artifact`（Worker/Managerブリッジ）:
  - 概要: 小タスクごとのドラフト成果物をCAS+アーティファクトとして保存/読取/差分/編集し、最終結果へ反映。
  - アクション: `ensure|worker_commit_text|read_latest|diff_with_text|apply_edits|finalize_to_task`
  

#### ツール間の関係と依存
- ストレージ層の共有（DAO直利用）
  - `subtask-artifact` と `final-result-save` は共通のストレージDAO（`contentStoreDAO`, `artifactDAO`）を内部で直接利用しています（`src/mastra/task-management/db/cas-dao.ts`）。
  - これにより、Worker/Manager のドラフト編集〜最終化と、CEO の最終成果物保存が同一のCAS/Artifact層で一貫して扱われます。
- オーケストレーションと結果保存
  - `workflow-orchestrator` → ジョブ開始/状態更新で`job-status-tool`（DB）を利用し、ワークフローを非同期起動します。
  - ワークフロー最終化はCEOの`final-result-save`が実施し、最終成果物をCAS/Artifactへ保存（`contentStoreDAO`/`artifactDAO`）→ 互換のため`.job-results/{jobId}.json`へも書き出し → `job-status-tool`でDBのジョブ状態/結果を更新。
- 結果閲覧/プレビュー
  - `job-result-fetch` → `job-status-tool.getJobResult`（DB優先→FSフォールバック）を利用して統一的な結果を取得。
  - `slide-preview-display` → 上記`getJobResult`の返却オブジェクトからHTMLを再帰抽出し、プレビューをトリガー。
- タスク管理のゲートと連携
  - `task-management` → 進行段階/連続性/並行実行の制御に`routing-validators`を利用。`requirePolicy`でCEOの`policy-management`の実施を前提化。
  - `batch-task-creation` → `requireStage('policy_set'|'planning')`を通過後に一括登録、重複ステップ番号の解決を実施。
  - `task-viewer` → 小タスク結果の参照専用（DAO読み取り）。
- ディレクティブ/ポリシー
  - `directive-management` → General起点の追加指令をDBに保存し、Managerがチェック/承認/適用。
  - `policy-management`/`policy-check` → CEOが戦略方針を保存/更新し、Manager側のツールで参照。
- MCP関連
  - `exa-mcp-search` → `getExaMCPClient()`でリモートMCP（Exa）へ接続し、検索タイプに応じたMCPツール名へ委譲。
  - `custom-mcp-invoke` → 任意のMCPサーバー（remote/local）を束ね、`serverId`と`toolName`でツール実行。

## 🏛️ アーキテクチャ

### システムアーキテクチャ（v5.0）

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  管理コンソール  │     │   チャットUI    │     │   APIルート     │
│                 │     │                 │     │                 │
│ • ワーカー      │     │ • モデル選択    │────▶│ • /api/chat     │
│ • 環境変数      │     │ • ストリーミング│     │ • /api/admin/*  │
│ • リアルタイム  │     │ • スレッドメモリ│     │ • /api/job-*    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         └───────────────────┬───────────────────────────┘
                            ▼
                    ┌─────────────────┐
                    │  Mastraコア     │
                    │                 │
                    │ • Agent Factory │
                    │ • Model Registry│
                    │ • Tool Registry │
                    └─────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ タスク管理DB    │ │ Agent Network   │ │  エージェント   │
│                 │ │                 │ │   定義DB        │
│ • タスク        │ │ • CEO Agent     │ │                 │
│ • ディレクティブ│ │ • Manager Agent │ │ • 動的生成      │
│ • ポリシー      │ │ • Worker Agent  │ │ • 設定管理      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### ディレクトリ構造

```
/
├── app/                    # Next.js App Router
│   ├── api/               # APIエンドポイント
│   │   ├── admin/         # 管理API（エージェント、ネットワーク、モデル、ツール）
│   │   ├── chat/          # メインチャットエンドポイント
│   │   ├── job-result/    # ジョブ結果取得
│   │   ├── agent-logs/    # エージェントログ
│   │   └── db-viewer/     # DB監視API
│   └── protected/         # 認証済みルート
│       ├── admin/         # 管理コンソール
│       └── chat/          # チャットインターフェース
├── components/            # Reactコンポーネント
│   ├── ui/               # shadcn/uiコンポーネント
│   └── db-viewers/       # DB監視コンポーネント
├── src/mastra/           # Mastra設定
│   ├── agents/           # エージェント定義
│   │   ├── factory.ts    # エージェントファクトリー
│   │   └── network/      # CEO、Manager、Worker
│   ├── config/           # 設定管理
│   │   ├── model-registry.ts  # モデルレジストリ
│   │   └── tool-registry.ts   # ツールレジストリ
│   ├── tools/            # Mastraツール
│   ├── task-management/  # タスク管理システム
│   │   ├── db/          # データベース層
│   │   └── tools/       # 管理ツール群
│   └── prompts/         # エージェントプロンプト
└── .job-results/        # 非同期ジョブ結果
```

## 🧩 MCP（Model Context Protocol）統合

- 実装場所: `src/mastra/mcp/`
- 目的: 外部のMCPサーバー（リモート/ローカル）をMastraのツールとして安全に呼び出す。

- Exa（リモートMCP）
  - クライアント: `src/mastra/mcp/exa-mcp-client.ts`
  - 接続: `https://mcp.exa.ai/mcp?exaApiKey=${EXA_API_KEY}`
  - 使用ツール: `exa-mcp-search`（検索タイプに応じてMCP内ツール名を柔軟一致で選択）
  - 必須環境変数: `EXA_API_KEY`

- Brave Search（ローカルMCP）
  - クライアント: `src/mastra/mcp/brave-mcp-client.ts`
  - 起動コマンド: `npx -y @modelcontextprotocol/server-brave-search`（`BRAVE_API_KEY` 必須）
  - 現状はデモ/拡張用。必要に応じてWorkersに割当可能。

- カスタムMCPツール（任意サーバー）
  - ファクトリ: `src/mastra/tools/custom-mcp-tool.ts`
  - 使い方: `createCustomMCPTool([{ id, kind: 'remote'|'local', url? , command?, args? }])`でMCPサーバー群を登録し、`serverId`と`toolName`で任意実行。
  - 例: `{ serverId: 'myServer', toolName: 'search', params: { query: '...', limit: 5 } }`


## 🚀 クイックスタート

### 前提条件

- Node.js 18以上
- npm または pnpm
- AIプロバイダーのAPIキー
- 検索MCP用のAPIキー（必要に応じて）
  - `EXA_API_KEY`（Exa検索MCP）
  - `BRAVE_API_KEY`（Brave MCP: 任意）

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
   # AIプロバイダーキー（必須）
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
   
   # Supabase認証（必須）
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # 検索MCP（推奨）
   EXA_API_KEY=your_exa_key
   # Brave MCP（任意）
   BRAVE_API_KEY=your_brave_key
   
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
   - チャットまたは管理コンソールへ移動

## 🎛️ 管理コンソール

管理コンソール（`/protected/admin/`）では、現在ワーカー定義と環境変数の管理機能を提供しています。

## 🤝 エージェントネットワークシステム

### ネットワーク実行フロー（vNext）

```
ユーザーリクエスト
     │
     ▼
General Agent
     │
     ├─▶ workflow-orchestrator（ワークフロー起動）
     ├─▶ directiveManagementTool（追加指令の作成）
     │
     ▼（バックグラウンド実行）
Agent Factory → 動的エージェント生成
     │
     ├─▶ CEOエージェント
     │   • policyManagementTool（方針設定）
     │   • taskViewerTool（タスク監視）
     │
     ├─▶ Managerエージェント
     │   • taskManagementTool / batchTaskCreationTool / directiveManagementTool / policyCheckTool
     │   • subtaskArtifactTool（ドラフト保存/差分/編集/最終化）
     │
     └─▶ Workerネットワーク（複数Workerのプール）
         • Search Worker: exaMCPSearchTool, docsReaderTool
         • Code Worker: subtask-artifact, taskManagementTool
         • General Worker: docsReaderTool ほか
```

## 🗂️ タスク管理システム

### ディレクティブ管理

追加指令を使用してタスクを動的に制御：

```typescript
// 追加指令の作成
await directiveManagementTool({
  action: 'create_directive',
  networkId: 'network-123',
  directiveData: {
    content: '品質基準を上げて、より詳細な分析を追加してください',
    type: 'policy_update',
    source: 'general-agent'
  }
});

// 指令の確認と適用（Manager Agent）
await directiveManagementTool({
  action: 'check_directives',
  networkId: 'network-123'
});
```

### ポリシー管理

CEOエージェントによる戦略的方針設定：

```typescript
await policyManagementTool({
  action: 'save_policy',
  networkId: 'network-123',
  policy: {
    strategy: '包括的な市場分析と競合調査',
    priorities: ['データの正確性', '分析の深さ', '実行可能な提案'],
    successCriteria: ['全競合の特定', 'SWOT分析完了'],
    qualityStandards: ['信頼できるソースのみ使用', '最新データ優先']
  }
});
```

### バッチタスク作成

複数タスクの一括生成：

```typescript
await batchTaskCreationTool({
  action: 'create_batch',
  networkId: 'network-123',
  tasks: [
    {
      task_type: 'web-search',
      task_description: '競合A社の最新動向調査',
      priority: 'high'
    },
    {
      task_type: 'analysis',
      task_description: '市場トレンド分析',
      priority: 'medium'
    }
  ]
});
```

### 成果物（Artifact）とCAS

- 目的: 大きなテキスト/HTMLを毎回プロンプトで往復させず、CAS（Content-Addressable Storage）+アーティファクトとして保存し差分/編集で効率化。
- 主に `subtask-artifact`（Worker/Manager）と `final-result-save`（CEO）が共通DAO（`contentStoreDAO`/`artifactDAO`）を直接利用して成果物を扱います。

### ワークフロー（実行ステップ詳細）

- `ceo-manager-worker-workflow`（`src/mastra/workflows/task-workflow-v2.ts`）
  - Step1 CEO（`ceo-policy`）: 方針作成/更新（`policy-management`）
  - Step2 Manager（`manager-plan`）: 小タスク計画・登録（`batch-task-creation`等）
  - Step3 Worker Network（ループ）: 次キュー小タスクを逐次実行し、ドラフトは`subtask-artifact`へ保存
  - Step4 Manager（レビュー）: `read_latest/diff_with_text/apply_edits/finalize_to_task`で確定
  - Step5 CEO（`ceo-finalize`）: 統合成果物を`final-result-save`で保存（`.job-results`とDBに永続化、スライドは`.generated-slides`にも保存）

## 🗃️ データベースとDAO

- ストレージ: LibSQL（`@libsql/client`）。初期化は `src/mastra/task-management/db/migrations.ts` の `initializeTaskManagementDB(url)`。
  - 生成スキーマは `src/mastra/task-management/db/schema.ts` の `SQL_SCHEMAS` に定義。
  - 既定は `:memory:`。`MASTRA_DB_URL` を指定すると永続ファイル（例: `file:./mastra.db`）に変更可能。開発時に `file:` の場合は古いDBをクリアするガードあり。
- 初期化の流れ:
  - `runMigrations()`: 各テーブルを作成（順序付き）
  - `seedDefaultWorkers()`: `agent_definitions` にデフォルトのSearch/Code Workerを投入
  - Mastra起動時: `src/mastra/index.ts` で `initializeTaskManagementDB(':memory:')` を実行、ログシンクも起動

### テーブル概要（主要列）
- `network_tasks`
  - 主キー: `task_id`
  - ネットワーク: `network_id`, `parent_job_id`, `network_type`
  - 状態/進捗: `status(queued|running|...)`, `progress`, `completed_at`
  - 内容: `task_type`, `task_description`, `task_parameters(JSON)`, `task_result(JSON)`
  - 実行管理: `created_by`, `assigned_to`, `priority`, `step_number`, `depends_on(JSON)`
  - 監査: `created_at`, `updated_at`, `metadata(JSON)`
  - インデックス: `status`, `network_id`, `parent_job_id`, `created_by`, `assigned_to`, `(network_id, step_number)`、一意制約 `(network_id, step_number)`（stepあり時）
- `network_directives`
  - 主キー: `directive_id`、参照: `network_id`
  - 内容/種別: `directive_content`, `directive_type(policy_update|...)`
  - 状態: `status(pending|acknowledged|applied|rejected)`、`acknowledged_at`, `applied_at`
  - 監査: `source`, `created_at`, `updated_at`, `metadata(JSON)`
  - インデックス: `network_id`, `status`, `created_at`
- `job_status`
  - `job_id` をキーに現在の状態/エラー/開始・完了時刻/付随メタを保持
  - `job-status-tool` と `workflow-orchestrator` が更新/参照
- `job_results`
  - `job_id` 単位の最終結果（JSON）と `workflow_id`、作成時刻
  - `final-result-save` が保存、`job-result-tool` が参照
- `agent_logs`
  - ジョブ単位の会話/内部ログ（`log_id`, `job_id`, `agent_id/name`, `message`, `iteration`, `message_type`, `metadata`, `timestamp`）
- `agent_definitions`
  - 動的なエージェント定義（`id`, `name`, `role`, `model_key`, `prompt_text`, `enabled`, `tools(JSON)`, `metadata(JSON)`, `updated_at`）
- `network_definitions`
  - ネットワーク定義（`id`, `name`, `agent_ids(JSON)`, `default_agent_id`, `routing_preset`, `enabled`, `updated_at`）
- CAS/Artifacts（成果物保存）
  - `content_store`: `content_hash`（主キー）, `content_type`, `content(Base64)`, `size`, `created_at`, `storage_location`
  - `content_chunks`: 大容量分割保存（`content_hash` に紐づく `chunk_index` 等）。再構築APIあり
  - `artifacts`: アーティファクト本体（`artifact_id`, `job_id`, `task_id`, `current_revision`, `mime_type`, `labels`, `created_at`, `updated_at`）
  - `artifact_revisions`: リビジョン（`revision_id`, `artifact_id`, `content_hash`, `parent_revisions(JSON)`, `commit_message`, `author`, `created_at`, `patch_from_parent`）

### DAO（Data Access Object）一覧と主なメソッド
- `src/mastra/task-management/db/dao.ts`
  - `NetworkTaskDAO`
    - 作成/取得/検索: `create`, `findById`, `findByNetworkId`, `findByStatus`, `findByNetworkAndStatus`
    - 実行順制御: `findNextQueuedByStep`（step順で次のqueuedを取得）
    - 更新: `updateStatus`, `updateProgress`, `updateResult`, `updateStatusAndResult`（完了時の`execution_time`も反映）
    - アサイン/メタ: `assignWorker`, `updateMetadata`
    - プラン操作: `deleteTasksFromStep`（未完了のみ削除）, `getNetworkSummary`
  - `NetworkDirectiveDAO`
    - `create`, `findById`, `findByNetworkId`, `findPendingByNetworkId`, `findUnacknowledged`
    - `updateStatus`（acknowledge/apply/reject を実装側ツールでラップ）
    - `hasUnacknowledgedDirectives`
  - `AgentDefinitionDAO` / `NetworkDefinitionDAO`
    - `findAll`, `findById`, `upsert`, `delete`, `setActiveNetwork`, `findFirstEnabled`
  - `getDAOs()` で各DAOをまとめて取得
- `src/mastra/task-management/db/cas-dao.ts`
  - `ContentStoreDAO`
    - `store`（ハッシュ生成/保存）, `retrieve`/`retrieveDecoded`, `appendChunk`, `reconstructFromChunks`, `getMetadata`
  - `ArtifactDAO`
    - `create`（初期リビジョンは空文字でCASへ）, `get`, `commit`（新リビジョン/親リビジョン連結/現在指し替え）, `getRevision`, `getRevisions`, `findByJobId`, `findByTaskId`
  - シングルトン: `contentStoreDAO`, `artifactDAO`

### ツールとDBの流れ（代表例）
- `workflow-orchestrator` → `job_status` 初期化・更新 → ワークフロー起動 → 各ステップで `network_tasks`/`network_directives` を操作
- Worker: `subtask-artifact.ensure/worker_commit_text` → `artifacts`/`artifact_revisions`/`content_store` にドラフト保存
- Manager: `subtask-artifact.read_latest/diff_with_text/apply_edits/finalize_to_task` → `network_tasks.task_result` を確定、必要に応じて`status=completed`
- CEO: `final-result-save` → 最終成果物をCAS/Artifact保存＋`job_results`/`job_status` を更新、互換のため `.job-results/{jobId}.json` にも出力

## 🎯 利用可能なモデル

### モデル一覧

| モデル | プロバイダー | ID | 特徴 |
|--------|------------|-----|------|
| **GPT-5** | OpenAI | `gpt-5` | 最新の次世代モデル、高度な推論 |
| **Claude Sonnet 4** | Anthropic | `claude-sonnet-4-20250514` | 日本語処理、複雑な分析（デフォルト） |
| **OpenAI o3** | OpenAI | `o3-2025-04-16` | 高性能推論 |
| **Gemini 2.5 Flash** | Google | `gemini-2.5-flash` | 高速レスポンス、コスト効率 |

### 動的モデル設定

管理コンソールまたはAPIで各エージェントのモデルを個別に設定可能：

```typescript
// Agent Factoryでの動的生成
const customAgent = createRoleAgent({
  role: 'WORKER',
  modelKey: 'gpt-5',  // GPT-5を使用
  memory: sharedMemory
});
```

## 📡 APIリファレンス

### 管理API

- `GET /api/admin/models` モデル一覧/メタ情報
- `GET /api/admin/tools` ツール一覧（ID/説明/スキーマ）
- `GET /api/admin/workers` / `POST /api/admin/workers` Worker定義の取得/作成
- `GET /api/admin/env` / `POST /api/admin/env` 環境変数の取得/更新（安全範囲）
- `GET /api/admin/prompts/worker-base` Worker共通プロンプトの取得

### チャットAPI

#### POST /api/chat
ストリーミングサポート付きメインチャットエンドポイント。
- リクエストに`model`を指定するとGeneralエージェントの推論モデルを切替。
- Generalエージェントは`workflow-orchestrator`等のツールのみ公開（直接ネットワーク実行はせず、常にワークフロー経由）。
- 応答ストリームはNDJSON（`application/x-ndjson`）。`reasoning`・`tool-execution`・`workflow-job`・`slide-preview-ready`・`message-complete`等のイベントを含む。

### モニタリングAPI

- `GET /api/db-viewer/tasks` タスク一覧/進捗
- `GET /api/db-viewer/directives` ディレクティブ一覧
- `GET /api/agent-logs/running-jobs` 実行中ジョブID一覧
- `GET /api/agent-logs/[jobId]` ジョブログの取得
- `GET /api/agent-logs/stream/[jobId]` ジョブログのストリーム
- `GET /api/job-result/[jobId]` 後方互換のジョブ結果JSON取得
- `GET /api/slides` / `GET /api/slides/[name]` 生成スライドの一覧/取得

## 🛠️ 開発

### コマンド

```bash
npm run dev        # Turbopackで開発サーバーを起動
npm run build      # プロダクションビルド
npm run start      # プロダクションサーバーを起動
npm run lint       # ESLintを実行
```

### タスク管理システムのテスト

```bash
npx tsx src/mastra/task-management/test-task-management.ts
```

### 新機能の追加

#### 新しいツールを追加
1. `/src/mastra/tools/`にツールを作成（100ms以内の応答必須）
2. `/src/mastra/config/tool-registry.ts`に登録
3. 適切な役割に割り当て

#### 新しいエージェントを追加
1. 管理コンソールから作成（推奨）
2. または`AgentFactory`を使用してコードで定義

#### 新しいWorkerを追加（ネットワーク拡張）
- `src/mastra/agents/network/workers/`にWorkerエージェント（Search/Code等）を追加
- 必要なツール（MCP含む）を割り当て
- DB定義を用いる場合は管理API/管理UIから`WORKER`レコードを追加し、`buildWorkerPoolNetworkFromDB`で自動反映

#### MCPを追加
- リモートMCP: `createCustomMCPTool([{ id: 'my-remote', kind: 'remote', url: 'https://example.com/mcp?...' }])`
- ローカルMCP: `createCustomMCPTool([{ id: 'local-server', kind: 'local', command: 'node', args: 'server.js' }])`
- 生成したツールをWorkerに割当（`tool-registry` or 個別Agent定義）

## 🔧 トラブルシューティング

### よくある問題

1. **エージェントが見つからない**
   - 管理コンソールでエージェント定義を確認
   - ネットワーク定義でエージェントIDが正しいか確認

2. **ディレクティブが適用されない**
   - Manager Agentがディレクティブを確認しているか確認
   - ディレクティブのステータスをDB Viewerで確認

3. **モデルエラー**
   - 環境変数にAPIキーが設定されているか確認
   - モデルレジストリで正しいモデルIDが使用されているか確認

## 🚀 最近の更新

### v5.0.0 - 管理コンソールと動的エージェント生成
- 🎛️ 管理コンソールによるエージェント・ネットワークの動的管理
- 🏭 Agent Factoryパターンによる柔軟なエージェント生成
- 🧠 GPT-5サポートを追加
- 📊 モデル・ツールレジストリによる中央集約管理
- 📝 ディレクティブ・ポリシー管理による精密な制御
- 🔍 DB Viewerによるリアルタイム監視
- ⚡ パフォーマンス最適化とアーキテクチャの簡素化

### v4.0.0 - 分散タスク管理システム
- 🗂️ Git風の分散タスク管理システム
- 📦 高度なタスク管理ツール群
- 🔄 タスク間での成果物共有機能

---

*Next.js 15、Mastra、最先端のAIモデルを使用して構築されました ❤️*
