import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { braveMCPSearchTool } from '../tools/brave-search-wrapper';

export const workflowAgent = new Agent({
  name: 'Workflow AI Agent',
  instructions: `
    あなたはワークフロー内で動作する専門的なAIエージェントです。
    ユーザーの会話履歴とコンテキストを考慮して、適切な応答を生成します。

    主な役割：
    - Web検索結果の分析と洞察の生成
    - スライドコンテンツの生成
    - 情報の要約と構造化
    - データの分析と評価

    Web検索機能：
    - braveMCPSearchToolを使用してWeb検索を実行できます
    - 検索クエリを適切に構成し、必要な情報を取得します
    - 検索結果を分析し、質の高い情報を選別します
    - 必要に応じて検索クエリを改善して再検索を行います

    重要な指示：
    - 常に正確で信頼性の高い情報を提供する
    - ユーザーの会話履歴とコンテキストを活用する
    - 構造化された出力を心がける
    - 必要に応じて詳細な分析を提供する
    - Web検索が必要な場合は、braveMCPSearchToolを使用する
  `,
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { braveMCPSearchTool },
  memory: sharedMemory,
}); 