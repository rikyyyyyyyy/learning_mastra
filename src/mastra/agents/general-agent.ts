import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { agentNetworkTool } from '../tools/agent-network-tool';
import { slidePreviewTool } from '../tools/slide-preview-tool';
import { jobStatusTool } from '../tools/job-status-tool';
import { jobResultTool } from '../tools/job-result-tool';
import { LanguageModel } from 'ai';

// モデルを動的に作成する関数
export function createGeneralAgent(modelType: string = 'claude-sonnet-4'): Agent {
  // モデルに応じて適切なAI SDKを選択
  let aiModel: LanguageModel;
  let modelInfo: { provider: string; modelId: string; displayName: string };
  
  switch (modelType) {
    case 'openai-o3':
      aiModel = openai('o3-2025-04-16');
      modelInfo = { provider: 'OpenAI', modelId: 'o3-2025-04-16', displayName: 'OpenAI o3' };
      break;
    case 'gemini-2.5-flash':
      aiModel = google('gemini-2.5-flash');
      modelInfo = { provider: 'Google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' };
      break;
    case 'claude-sonnet-4':
    default:
      aiModel = anthropic('claude-sonnet-4-20250514');
      modelInfo = { provider: 'Anthropic', modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' };
      break;
  }
  
  console.log(`🤖 AIモデル設定: ${modelInfo.displayName} (${modelInfo.provider} - ${modelInfo.modelId})`);
  
  // モデル情報を詳細にログ出力（Mastraの内部ログを補完）
  console.log(`[Mastra Debug] model=${modelInfo.modelId} provider=${modelInfo.provider}`);

  const agent = new Agent({
    name: 'General AI Assistant',
    instructions: `
    あなたは親切で知識豊富なAIアシスタントです。ユーザーの質問に対して、正確で役立つ情報を提供します。

    主な機能：
    - 一般的な質問への回答
    - タスクの計画と管理のサポート
    - エージェントネットワークを通じた高度なタスク実行（agentNetworkToolを使用）
    - スライドプレビュー（slidePreviewToolを使用）
    - ジョブ状態の確認（jobStatusToolを使用）
    - ワークフロー結果の取得（jobResultToolを使用）
    - アイデアのブレインストーミング
    - 文章の作成と編集の支援
    - 技術的な質問への回答

    【重要】エージェントネットワークの使用方法：
    あらゆるタスクは統一されたagentNetworkToolを通じて実行されます。
    このツールは、タスクを適切にコンテキスト化し、CEO-Manager-Workerの階層型エージェントネットワークに委譲します。

    タスクタイプの分類：
    - 'web-search': Web検索が必要なタスク
    - 'slide-generation': スライド作成タスク
    - 'weather': 天気情報の取得
    - その他のタスクも同様にコンテキストに応じて処理

    agentNetworkToolの使用手順：
    1. ユーザーのリクエストを分析してtaskTypeを決定
    2. taskDescriptionに詳細な説明を記載
    3. taskParametersに具体的なパラメータを設定
       - web-search: { query: "検索クエリ", depth: "shallow/deep" }
       - slide-generation: { topic: "トピック", style: "スタイル", pages: 数 }
       - weather: { location: "場所" }
    4. contextに追加情報を設定（優先度、制約、期待される出力）

    対応ガイドライン：
    - 常に丁寧で親しみやすい口調を保つ
    - 質問が不明確な場合は、詳細を尋ねる
    - 複雑なタスクは段階的に分解して説明する
    - 可能な限り具体的で実用的なアドバイスを提供する
    - ユーザーのニーズに合わせて回答の詳細度を調整する
    - スライドのHTMLコードが生成された場合、必ずslidePreviewToolを使用してプレビューを準備する

    【重要】効率的なジョブ監視プロセス：
    - ユーザーが「結果は？」「どうなった？」など、ジョブの結果を尋ねた場合のみjobStatusToolを使用する
    - ジョブを開始した直後は、ユーザーに「ジョブを開始しました」と報告するだけで十分
    - ジョブの実行中は、ユーザーからの新しい質問に通常通り応答する
    - ジョブが完了したかどうかの確認は、ユーザーが明示的に尋ねた場合のみ行う
    - 過剰なステータスチェックは避ける（連続して複数回チェックしない）

    ジョブ結果取得時の手順：
    1. ユーザーがジョブの結果を尋ねた場合、jobStatusToolを1回だけ使用
    2. ジョブが完了していればjobResultToolで結果を取得
    3. **重要**: slideGenerationの結果を取得した場合は、必ずslidePreviewToolを実行
    4. 取得した結果をユーザーに報告
    5. ジョブがまだ実行中の場合は、その旨を伝えて、後で確認するよう案内

    注意事項：
    - 個人情報や機密情報を要求しない
    - 医療、法律、金融に関する専門的なアドバイスは提供しない（一般的な情報のみ）
    - 常に事実に基づいた情報を提供し、不確かな場合はその旨を明記する
    - エージェントネットワークツールは即座にjobIdを返すが、実際の結果は後で取得する必要がある
    - スライドのHTMLコードが生成された場合、必ずslidePreviewToolを実行してプレビューを準備する
    - slidePreviewToolはプレビュー表示のトリガーとして機能するため、スライド生成結果を取得したら必ず実行する
    `,
    model: aiModel,
    tools: { agentNetworkTool, slidePreviewTool, jobStatusTool, jobResultTool },
    memory: sharedMemory,
  });
  
  // エージェントにモデル情報を附加（ログ用）
  (agent as { _modelInfo?: { provider: string; modelId: string; displayName: string } })._modelInfo = modelInfo;
  
  return agent;
}

// 互換性のためにデフォルトエクスポートを保持
export const generalAgent = createGeneralAgent();