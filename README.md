# 🔍 Mastra Web検索システム

Mastraフレームワークを使用したGPT-4o Search Preview対応のWeb検索システムです。高速なレスポンス、非同期処理、ジョブ管理機能を提供します。

## 📋 目次

- [特徴](#特徴)
- [アーキテクチャ](#アーキテクチャ)
- [セットアップ](#セットアップ)
- [使用方法](#使用方法)
- [Web検索システム](#web検索システム)
- [ジョブ管理システム](#ジョブ管理システム)
- [エージェント](#エージェント)
- [ワークフロー](#ワークフロー)
- [API仕様](#api仕様)
- [トラブルシューティング](#トラブルシューティング)

## ✨ 特徴

### 🚀 高速レスポンス
- ツールが100ms以内でjobIdを返却
- ユーザーは即座に応答を受け取り可能

### 🔄 非同期処理
- ワークフローがバックグラウンドで実行
- 長時間の処理でもUIがブロックされない

### 📊 ジョブ管理
- ジョブ状態の追跡（queued → running → completed/failed）
- 進捗監視とエラーハンドリング

### 🌐 リアルタイムWeb検索
- GPT-4o Search Previewによる最新情報検索
- 自動引用元収集と信頼性評価

### 🧠 AI分析
- 検索結果の自動分析と洞察生成
- 信頼性スコア算出

## 🏗️ アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ユーザー      │    │     ツール      │    │  ワークフロー   │
│                 │    │                 │    │                 │
│ Web検索要求     │───▶│ jobId即座返却   │───▶│ バックグラウンド│
│ (<100ms)        │    │ ジョブ登録      │    │ 実行            │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  ジョブ管理     │    │  結果格納       │
                       │                 │    │                 │
                       │ 状態追跡        │    │ レポート生成    │
                       │ 進捗監視        │    │ メタデータ保存  │
                       └─────────────────┘    └─────────────────┘
```

## 🛠️ セットアップ

### 前提条件

- Node.js 18以上
- OpenAI APIキー
- Supabase プロジェクト（認証用）

### インストール

1. **リポジトリのクローン**
   ```bash
   git clone <repository-url>
   cd learning_mastra
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   # または
   pnpm install
   ```

3. **環境変数の設定**
   `.env.local`ファイルを作成：
   ```env
   # OpenAI API
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

## 📖 使用方法

### チャットUIでの使用

1. http://localhost:3000 にアクセス
2. ログイン後、保護されたチャットページに移動
3. 「今日のニュースを検索して」などのメッセージを送信
4. エージェントが自動的にWeb検索を実行し、結果を報告

### API経由での使用

```typescript
// Web検索ジョブの登録
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '最新のAI技術について検索して' }
    ]
  })
});
```

## 🔍 Web検索システム

### コンポーネント構成

```
src/mastra/
├── tools/
│   ├── web-search-tool.ts      # ジョブ登録（高速レスポンス）
│   ├── job-status-tool.ts      # ジョブ状態管理
│   └── job-result-tool.ts      # ジョブ結果取得
├── workflows/
│   └── web-search-workflow.ts  # 実際の検索処理
└── agents/
    └── general-agent.ts        # メインエージェント
```

### ワークフロー実行ステップ

1. **検索実行** (`gpt4oWebSearchStep`)
   - GPT-4o Search Previewを使用
   - リアルタイムWeb検索
   - 引用元URL自動収集

2. **結果分析** (`gpt4oAnalysisStep`)
   - 検索結果の信頼性評価
   - 主要な洞察抽出
   - 推奨事項生成

3. **レポート生成** (`generateWebSearchReportStep`)
   - Markdown形式のレポート作成
   - メタデータ付与
   - 信頼性スコア算出

### 検索結果の例

```markdown
# 🔍 Web検索レポート

## 検索クエリ
**「最新AI技術トレンド」**

## 📊 実行サマリー
- **使用モデル**: gpt-4o-search-preview
- **検索時間**: 3450ms
- **引用元数**: 8件
- **信頼性スコア**: 85% 🟢

## 🌐 検索結果
[詳細な検索結果...]

## 🧠 AI分析結果
[分析内容...]

## 📚 引用元・参考資料
1. [https://example.com/ai-trends](https://example.com/ai-trends)
2. [https://tech-news.com/latest](https://tech-news.com/latest)
...
```

## 📋 ジョブ管理システム

### ジョブライフサイクル

```
queued → running → completed/failed
```

### 状態管理

```typescript
// ジョブ状態の確認
const status = await jobStatusTool.execute({
  context: { jobId: 'web-search-1234567890-abc123' }
});

// 結果の取得
const result = await jobResultTool.execute({
  context: { jobId: 'web-search-1234567890-abc123' }
});
```

### ジョブ監視

エージェントは毎回の会話で自動的に：
1. 完了したジョブがないかチェック
2. 完了したジョブの結果を取得
3. ユーザーに結果を報告

## 🤖 エージェント

### General Agent

**役割**: メインの対話エージェント
**機能**:
- 一般的な質問への回答
- Web検索の実行とジョブ管理
- 天気情報の提供
- ジョブ状態の自動監視

**利用可能ツール**:
- `webSearchTool` - Web検索ジョブ登録
- `jobStatusTool` - ジョブ状態確認
- `jobResultTool` - ジョブ結果取得
- `weatherTool` - 天気情報取得

### Weather Agent

**役割**: 天気情報専門エージェント（使用例）
**機能**:
- 特定地域の天気情報取得
- 天気に基づく活動提案

## 🔄 ワークフロー

### Web検索ワークフロー

```typescript
export const webSearchWorkflow = createWorkflow({
  id: 'web-search-workflow',
  description: 'GPT-4o Search Previewを使用してリアルタイムWeb検索と分析を行う',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().default(5),
    language: z.string().optional().default('ja'),
    userLocation: z.object({...}).optional(),
  }),
})
  .then(gpt4oWebSearchStep)
  .then(gpt4oAnalysisStep)
  .then(generateWebSearchReportStep)
  .commit();
```

### 天気ワークフロー（使用例）

```typescript
export const weatherWorkflow = createWorkflow({
  id: 'weather-workflow',
  inputSchema: z.object({
    city: z.string(),
  }),
})
  .then(fetchWeather)
  .then(planActivities);
```

## 📡 API仕様

### Chat API

**エンドポイント**: `/api/chat`
**メソッド**: POST

**リクエスト**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "最新のAI技術について検索して"
    }
  ]
}
```

**レスポンス**:
```json
{
  "role": "assistant",
  "content": "Web検索を実行します...",
  "toolCalls": [
    {
      "toolName": "web-search-queue",
      "result": {
        "jobId": "web-search-1234567890-abc123",
        "status": "queued",
        "message": "Web検索ジョブをキューに登録しました"
      }
    }
  ]
}
```

## 🔧 設定とカスタマイズ

### 検索設定

```typescript
// 地理的位置の設定
userLocation: {
  country: 'JP',
  city: 'Tokyo',
  region: 'Tokyo'
}

// 検索詳細度
search_context_size: 'high' // 'low', 'medium', 'high'
```

### 信頼性スコア計算

```typescript
let reliabilityScore = 50; // ベーススコア
reliabilityScore += model.includes('search-preview') ? 20 : 0; // モデルボーナス
reliabilityScore += Math.min(20, citations.length * 4); // 引用元ボーナス
reliabilityScore += Math.min(10, domains.size * 2); // ドメイン多様性
```

## 🚨 トラブルシューティング

### よくある問題

**1. OpenAI APIエラー**
```
Error: Model incompatible request argument supplied: temperature
```
**解決策**: GPT-4o Search Previewは`temperature`パラメータをサポートしていません。

**2. ジョブが完了しない**
- ネットワーク接続を確認
- OpenAI APIキーの有効性を確認
- ジョブ状態を`jobStatusTool`で確認

**3. 引用元が取得できない**
- GPT-4o Search Previewのアノテーション機能を利用
- フォールバック用の正規表現も実装済み

### デバッグ

```typescript
// ジョブ状態の詳細確認
console.log('Job Status:', await jobStatusTool.execute({ context: { jobId } }));

// ワークフロー進捗の監視
run.watch((event) => {
  console.log('Workflow Event:', event.type, event.payload);
});
```

## 🔮 今後の拡張

- [ ] 複数検索エンジンの対応
- [ ] 検索結果のキャッシュ機能
- [ ] より詳細な分析レポート
- [ ] 検索履歴の管理
- [ ] カスタム検索フィルター

## 📄 ライセンス

MIT License

---

*このシステムはMastraフレームワークとGPT-4o Search Previewを活用した次世代Web検索ソリューションです。*
