import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { sharedMemory } from '../shared-memory';

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
  model: google('gemini-2.5-flash', {
    useSearchGrounding: true,
    // 動的検索の設定（必要に応じて検索を実行）
    dynamicRetrievalConfig: {
      mode: 'MODE_DYNAMIC',
      dynamicThreshold: 0.7  // 検索が必要かどうかの閾値
    }
  }),
  tools: {}, // Google Search groundingは内蔵機能のため、外部ツールは不要
  memory: sharedMemory,
});