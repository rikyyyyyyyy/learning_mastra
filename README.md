# 🤖 Mastra AIアシスタントプラットフォーム

Next.jsとMastraフレームワークで構築された高度なマルチモデルAIアシスタントプラットフォーム。階層型エージェントネットワーク、非同期ジョブ処理、包括的なタスク自動化機能を備えています。

## 📋 目次

- [概要](#概要)
- [主な機能](#主な機能)
- [アーキテクチャ](#アーキテクチャ)
- [クイックスタート](#クイックスタート)
- [エージェントネットワークシステム](#エージェントネットワークシステム)
- [利用可能なモデル](#利用可能なモデル)
- [APIリファレンス](#apiリファレンス)
- [UI機能](#ui機能)
- [開発](#開発)
- [設定](#設定)

## 🌟 概要

このプラットフォームは、Mastraフレームワークを活用した本番環境対応のAIアシスタントシステムです：

- **マルチモデル対応**: Claude Sonnet 4、OpenAI o3、Gemini 2.5 Flashをシームレスに切り替え
- **階層型エージェントネットワーク**: 複雑なタスク委譲のためのCEO-Manager-Workerパターン
- **非同期処理**: リアルタイムステータス追跡機能を持つノンブロッキングジョブシステム
- **豊富な機能**: Web検索、天気情報、スライド生成など
- **エンタープライズ機能**: 認証、スレッドベースメモリ、構造化ログ

## ✨ 主な機能

### 🧠 マルチモデルAI統合
- **Claude Sonnet 4** (Anthropic): 高度な推論と分析
- **OpenAI o3**: 最新の高性能推論モデル
- **Gemini 2.5 Flash** (Google): 思考プロセスを可視化した高速レスポンス
- チャットUIでの動的モデル選択

### 🏗️ 階層型エージェントネットワーク
- **実行フロー**: Agent Network Tool → agent-network-workflow → NewAgentNetwork
- **CEOエージェント**: 戦略的タスク指示と高レベル計画（デフォルトエージェント）
- **Managerエージェント**: タスク分解と運用調整
- **Workerエージェント**: 専門ツールを使用した効率的なタスク実行
- **協調メカニズム**: 最大10回の反復でエージェント間が自律的に連携

### ⚡ 非同期ジョブシステム
- ツールは即座にジョブIDを返却（< 100ms）
- バックグラウンドワークフロー実行
- リアルタイムステータス追跡: `queued → running → completed/failed`
- 結果は`.job-results`ディレクトリに保存

### 🔍 高度な機能
- **Web検索**: Brave検索とExa MCP統合による強力な検索
- **天気情報**: リアルタイム天気データ取得
- **スライド生成**: ライブプレビュー付きHTMLベースのプレゼンテーション
- **メモリ管理**: LibSQLによるスレッドベースの会話

### 🔐 エンタープライズ対応
- SSRサポート付きSupabase認証
- 保護されたルートとセッション管理
- PinoLoggerによる構造化ログ
- strictモードのTypeScript

## 🏛️ アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   チャットUI    │     │   APIルート     │     │  Mastraコア     │
│                 │     │                 │     │                 │
│ • モデル選択    │────▶│ • /api/chat     │────▶│ • エージェント  │
│ • ストリーミング│     │ • /api/job-*    │     │ • ツール        │
│ • スレッドメモリ│     │ • 認証MW        │     │ • ワークフロー  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ ジョブシステム   │     │ エージェント    │
                        │                 │     │ ネットワーク    │
                        │ • 即座にID返却  │────▶│ • ワークフロー  │
                        │ • 非同期実行    │     │ • NewAgentNetwork│
                        │ • 結果保存      │     │ • エージェント協調│
                        └─────────────────┘     └─────────────────┘
```

### ディレクトリ構造

```
/
├── app/                    # Next.js App Router
│   ├── api/               # APIエンドポイント
│   │   ├── chat/         # メインチャットエンドポイント
│   │   └── job-result/   # ジョブ結果取得
│   ├── auth/             # 認証ページ
│   └── protected/        # 保護されたルート
│       └── chat/         # チャットインターフェース
├── components/            # Reactコンポーネント
│   └── ui/               # shadcn/uiコンポーネント
├── src/mastra/           # Mastra設定
│   ├── agents/           # AIエージェント
│   │   └── network/      # CEO、Manager、Worker
│   ├── tools/            # Mastraツール
│   │   └── delegation/   # ネットワーク委譲ツール
│   └── workflows/        # バックグラウンドワークフロー
└── lib/                  # ユーティリティ
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
   npm install
   # または
   pnpm install
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
General Agent
     │
     ▼
Agent Network Tool（ジョブID即座返却）
     │
     ▼（バックグラウンド実行）
agent-network-workflow
     │
     ▼
NewAgentNetwork作成
     │ • CEOエージェント（デフォルト）
     │ • Managerエージェント
     │ • Workerエージェント
     │
     ▼
ネットワーク内でのエージェント協調（最大10回の反復）
     │
     ├─▶ CEOエージェント
     │   • タスク分析と戦略立案
     │   • delegate-to-managerツールでManagerへ委譲
     │
     ├─▶ Managerエージェント
     │   • 詳細計画作成とタスク分解
     │   • assign-to-workerツールでWorkerへ割り当て
     │
     └─▶ Workerエージェント
         • 具体的なタスク実行
         • exaMCPSearchTool、weatherToolなどを使用
         • 結果をManagerへ報告
```

### タスクフロー

1. **ユーザーリクエスト**: チャットUI経由でGeneral Agentに送信
2. **タスク分析**: General Agentがタスクタイプとパラメータを決定
3. **ジョブ登録**: Agent Network Toolが即座にジョブIDを返却（< 100ms）
4. **ワークフロー起動**: バックグラウンドでagent-network-workflowが実行
5. **ネットワーク作成**: NewAgentNetworkインスタンスが3つのエージェントで構成
6. **協調実行**: 
   - CEOエージェントがタスクを受け取り戦略を立案
   - 必要に応じてManagerエージェントに委譲
   - Managerがタスクを分解してWorkerに割り当て
   - Workerが実際のツールを使用して実行
   - 結果が階層を通じて集約される
7. **結果保存**: ワークフロー完了後、結果が`.job-results`ディレクトリに保存

### タスク構造の例

```typescript
{
  taskType: "web-search",          // または "slide-generation", "weather"
  taskDescription: "最新のAIニュースを検索",
  taskParameters: {
    query: "AI breakthroughs 2024",
    depth: "deep"
  },
  context: {
    priority: "high",
    constraints: { maxResults: 10 },
    expectedOutput: "引用付きの包括的なレポート"
  }
}
```

## 🎯 利用可能なモデル

### Claude Sonnet 4（デフォルト）
- **プロバイダー**: Anthropic
- **モデルID**: `claude-sonnet-4-20250514`
- **最適な用途**: 複雑な推論、分析、創造的タスク
- **使用場所**: 
  - General Agent（デフォルト）
  - ネットワーク内の全エージェント（CEO、Manager、Worker）
  - レガシーエージェント（weather-agent、workflow-agent、workflow-search-agent）

### OpenAI o3
- **プロバイダー**: OpenAI
- **モデルID**: `o3-2025-04-16`
- **最適な用途**: 高性能推論タスク
- **機能**: 最新の推論能力

### Gemini 2.5 Flash
- **プロバイダー**: Google
- **モデルID**: `gemini-2.5-flash`
- **最適な用途**: 高速レスポンス、思考プロセスの可視化
- **機能**: コスト効率の良い高速処理

## 📡 APIリファレンス

### POST /api/chat

ストリーミングサポート付きメインチャットエンドポイント。

**リクエスト:**
```json
{
  "message": "最新のAIニュースを検索して",
  "threadId": "optional-thread-id",
  "model": "claude-sonnet-4"  // または "openai-o3", "gemini-2.5-flash"
}
```

**レスポンス:** テキストデルタ、ツール実行、イベントを含むNDJSONストリーム

### GET /api/job-result/[jobId]

非同期ジョブの結果を取得。

**レスポンス:**
```json
{
  "status": "completed",
  "result": {
    "data": "...",
    "metadata": { ... }
  }
}
```

## 💻 UI機能

### チャットインターフェース
- **モデル選択**: AIモデルを切り替えるドロップダウン
- **ストリーミングレスポンス**: リアルタイムメッセージ更新
- **ツール可視化**: ツール使用時の表示
- **スレッド管理**: 簡単に新しい会話を開始
- **ダークモード**: 完全なダークモードサポート

### 特別な機能
- **スライドプレビュー**: 生成されたスライドの自動HTMLプレビュー
- **進捗インジケーター**: 長時間タスクの視覚的フィードバック
- **エラーハンドリング**: 明確なエラーメッセージと回復オプション

## 🛠️ 開発

### コマンド

```bash
npm run dev        # Turbopackで開発サーバーを起動
npm run build      # プロダクションビルド
npm run start      # プロダクションサーバーを起動
npm run lint       # ESLintを実行
```

### 新機能の追加

#### 新しいツールを追加
1. `/src/mastra/tools/`にツールを作成
2. ジョブキューイングパターンを実装
3. `/src/mastra/index.ts`に登録
4. 関連するエージェントに追加

#### 新しいワークフローを追加
1. `/src/mastra/workflows/`にワークフローを作成
2. Zodスキーマでステップを定義
3. Mastra設定に登録
4. 対応するツールを作成

#### エージェントの動作を変更
1. `/src/mastra/agents/`のエージェントファイルを編集
2. インストラクションや利用可能なツールを更新
3. 異なるシナリオでテスト

## ⚙️ 設定

### メモリストレージ
デフォルトではインメモリLibSQLを使用。永続化する場合：
```typescript
storage: new LibSQLStore({
  url: "file:./mastra.db",  // ":memory:"から変更
})
```

### ログレベル
環境変数で設定：
```env
LOG_LEVEL=debug  # または info, warn, error
```

### モデル設定
モデルは`/src/mastra/agents/general-agent.ts`で設定可能

## 🔧 トラブルシューティング

### よくある問題

1. **認証エラー**
   - Supabase認証情報を確認
   - 認証ミドルウェアの設定を確認

2. **ジョブが完了しない**
   - APIキーの有効性を確認
   - jobStatusToolでジョブステータスを監視
   - `.job-results`ディレクトリを確認

3. **モデルエラー**
   - APIキーが設定されているか確認
   - モデルの利用可能性を確認
   - リクエストパラメータを確認

### デバッグモード

詳細ログを有効化：
```typescript
logger: new PinoLogger({
  level: 'debug'
})
```

## 🚀 デプロイメント

アプリケーションは以下に最適化されています：
- Vercel（推奨）
- 任意のNode.jsホスティングプラットフォーム
- Dockerコンテナ

デプロイメント環境ですべての環境変数が適切に設定されていることを確認してください。

## 📄 ライセンス

MIT License

---

*Next.js、Mastra、最先端のAIモデルを使用して構築されました ❤️*