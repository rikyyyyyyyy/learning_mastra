import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 共有モデル型
export type AnyModel = ReturnType<typeof openai>;

export type ModelKey =
  | 'gpt-5'
  | 'openai-o3'
  | 'gemini-2.5-flash'
  | 'claude-sonnet-4';

export interface ResolvedModelInfo {
  provider: string;
  modelId: string;
  displayName: string;
}

export interface ResolvedModel {
  aiModel: AnyModel;
  info: ResolvedModelInfo;
}

// 単一点のモデルレジストリ
export function resolveModel(modelType?: string): ResolvedModel {
  switch (modelType as ModelKey | undefined) {
    case 'gpt-5':
      return {
        aiModel: openai('gpt-5'),
        info: { provider: 'OpenAI', modelId: 'gpt-5', displayName: 'GPT-5' },
      };
    case 'openai-o3':
      return {
        aiModel: openai('o3-2025-04-16'),
        info: { provider: 'OpenAI', modelId: 'o3-2025-04-16', displayName: 'OpenAI o3' },
      };
    case 'gemini-2.5-flash':
      return {
        aiModel: google('gemini-2.5-flash'),
        info: { provider: 'Google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      };
    case 'claude-sonnet-4':
    default:
      return {
        aiModel: anthropic('claude-sonnet-4-20250514'),
        info: { provider: 'Anthropic', modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
      };
  }
}

