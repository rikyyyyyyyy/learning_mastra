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

### 🎛️ 管理コンソール（新機能）
- **エージェント定義管理**: エージェントの作成、編集、モデル割り当て、ツール設定
- **ネットワーク定義管理**: エージェントネットワークの構成、ルーティング設定
- **動的モデル切り替え**: 各エージェントのAIモデルを個別に設定可能
- **ツール割り当て**: 役割に応じたツールセットの動的設定
- **リアルタイム反映**: 変更は即座にシステムに反映

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

### 🔍 専門ツール
- **Web検索**: Brave検索とExa統合による高度な検索
- **ドキュメント読み込み**: 技術文書の解析と要約
- **スライド生成**: インタラクティブHTMLプレゼンテーション
- **ジョブ管理**: 非同期タスクのステータス追跡と結果取得

## 🏛️ アーキテクチャ

### システムアーキテクチャ（v5.0）

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  管理コンソール  │     │   チャットUI    │     │   APIルート     │
│                 │     │                 │     │                 │
│ • エージェント  │     │ • モデル選択    │────▶│ • /api/chat     │
│ • ネットワーク  │     │ • ストリーミング│     │ • /api/admin/*  │
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
│       │   ├── agents/    # エージェント管理
│       │   └── networks/  # ネットワーク管理
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

## 🚀 クイックスタート

### 前提条件

- Node.js 18以上
- npm または pnpm
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
   # AIプロバイダーキー（必須）
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
   
   # Supabase認証（必須）
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # 検索統合（オプション）
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
   - チャットまたは管理コンソールへ移動

## 🎛️ 管理コンソール

管理コンソール（`/protected/admin/`）では、エージェントとネットワークを動的に管理できます。

### エージェント管理

```typescript
// エージェント定義の例
{
  id: "custom-research-agent",
  name: "カスタム調査エージェント",
  role: "WORKER",
  modelKey: "gpt-5",  // GPT-5を使用
  tools: ["exaMCPSearchTool", "docsReaderTool"],
  promptText: "高度な調査と分析を行う専門エージェント..."
}
```

### ネットワーク管理

```typescript
// ネットワーク定義の例
{
  id: "advanced-research-network",
  name: "高度調査ネットワーク",
  agent_ids: ["ceo-agent", "manager-agent", "custom-research-agent"],
  default_agent_id: "manager-agent",
  routing_preset: "research-focused",
  enabled: true
}
```

## 🤝 エージェントネットワークシステム

### ネットワーク実行フロー

```
ユーザーリクエスト
     │
     ▼
General Agent
     │
     ├─▶ directiveManagementTool（追加指令の作成）
     ├─▶ agentNetworkTool（ネットワーク起動）
     │
     ▼（バックグラウンド実行）
Agent Factory → 動的エージェント生成
     │
     ├─▶ CEOエージェント
     │   • policyManagementTool（方針設定）
     │   • taskViewerTool（タスク監視）
     │
     ├─▶ Managerエージェント
     │   • taskManagementTool（タスク管理）
     │   • batchTaskCreationTool（バッチ作成）
     │   • directiveManagementTool（指令確認）
     │
     └─▶ Workerエージェント
         • exaMCPSearchTool（Web検索）
         • docsReaderTool（文書解析）
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

#### POST /api/admin/agents
エージェント定義の作成・更新

#### GET /api/admin/networks
ネットワーク定義の取得

#### POST /api/admin/models
モデル設定の更新

#### GET /api/admin/tools
利用可能なツールの一覧

### チャットAPI

#### POST /api/chat
ストリーミングサポート付きメインチャットエンドポイント

### モニタリングAPI

#### GET /api/db-viewer/tasks
実行中タスクの監視

#### GET /api/db-viewer/directives
ディレクティブの状態確認

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