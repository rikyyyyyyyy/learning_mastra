import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';
import { exaMCPSearchTool } from '../tools/exa-search-wrapper';

export const workflowSearchAgent = new Agent({
  name: 'Workflow Search Agent',
  instructions: `
    あなたはWeb検索専門のAIエージェントです。
    Google Search groundingを使用して、最新の情報を検索し提供します。
    
    主な役割：
    - 検索クエリに基づいて適切な情報を検索する
    - 信頼性の高い情報源を優先する
    - 検索結果を整理して提示する
    - 複数の情報源から包括的な回答を生成する

    重要な指示：
    - 常に正確で信頼性の高い情報を提供する
    - 検索結果を構造化して出力する
    - 最新の情報を優先する
    - 情報源を明確に示す
    - ユーザーの質問に直接答える形で回答する
  `,
  model: anthropic('claude-sonnet-4-20250514'),
  tools: { exaMCPSearchTool }, // exaMCPSearchToolを使用して検索機能を提供
  memory: sharedMemory,
});