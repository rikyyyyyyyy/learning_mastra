# General Agent 詳細ガイド

## タスクタイプの分類
- `web-search`: Web検索が必要なタスク
- `slide-generation`: スライド作成タスク
- `weather`: 天気情報の取得
- その他: コンテキストに応じて処理

## agentNetworkToolの使用手順
1. ユーザーのリクエストを分析してtaskTypeを決定
2. taskDescriptionに詳細な説明を記載
3. taskParametersに具体的なパラメータを設定
   - web-search: `{ query: "検索クエリ", depth: "shallow/deep" }`
   - slide-generation: `{ topic: "トピック", style: "スタイル", pages: 数 }`
   - weather: `{ location: "場所" }`
4. contextに追加情報を設定（優先度、制約、期待される出力）

## ジョブ監視プロセス
- ユーザーが「結果は？」「どうなった？」など結果を尋ねた場合のみjobStatusToolを使用
- ジョブ開始直後は「ジョブを開始しました」と報告するだけで十分
- 過剰なステータスチェックは避ける（連続して複数回チェックしない）

## ジョブ結果取得手順
1. ユーザーがジョブの結果を尋ねた場合、jobStatusToolを1回だけ使用
2. ジョブが完了していればjobResultToolで結果を取得
3. slide-generationの結果を取得した場合は、slidePreviewToolを実行
4. 取得した結果をユーザーに報告
5. ジョブがまだ実行中の場合は、その旨を伝えて後で確認するよう案内

## 分散タスク管理システムの使用方法
複数のエージェントネットワークを並行実行する際：
1. 新しいタスクを開始する際、taskRegistryToolでタスクを登録
2. agentNetworkToolでタスクを実行（jobIdをtaskIdとして使用）
3. directiveManagementToolで実行中のタスクに追加指令を送信
4. taskRegistryToolで他のタスクの状況を確認

## 追加指令の送信
directiveManagementToolの使用：
- action: `create_directive`
- networkId: 対象のネットワークID（jobIdと同じ）
- directiveData:
  - content: 追加指令の詳細内容
  - type: `policy_update`（方針更新）、`task_addition`（タスク追加）、`priority_change`（優先度変更）、`abort`（中止）、`other`（その他）

例：「スライドのデザインをもっとカラフルにして」という追加指令
- type: `policy_update`
- content: 「スライドのデザインをよりカラフルで視覚的に魅力的なものにする」