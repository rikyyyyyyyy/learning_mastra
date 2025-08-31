import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 共有モデル型（各プロバイダで互換の型を想定）
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
  capabilities?: { reasoning?: boolean };
}

export interface ResolvedModel {
  aiModel: AnyModel;
  info: ResolvedModelInfo & { key: ModelKey };
}

// 単一情報源としてのモデル定義
type ModelEntry = ResolvedModelInfo & { options?: Record<string, unknown> };
const MODEL_REGISTRY: Record<ModelKey, ModelEntry> = {
  // 最新のGPT-5（実IDに固定。2025-08-07 時点）
  'gpt-5': {
    provider: 'OpenAI',
    modelId: 'gpt-5-2025-08-07',
    displayName: 'GPT-5',
    capabilities: { reasoning: true },
    // options: { reasoning: { effort: 'medium' } }, // 例: reasoningを有効化する場合に使用
  },
  'openai-o3': {
    provider: 'OpenAI',
    modelId: 'o3-2025-04-16',
    displayName: 'OpenAI o3',
    capabilities: { reasoning: true },
  },
  'gemini-2.5-flash': {
    provider: 'Google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    capabilities: { reasoning: false },
  },
  'claude-sonnet-4': {
    provider: 'Anthropic',
    modelId: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    capabilities: { reasoning: false },
  },
};

export function listModels(): { key: ModelKey; info: ResolvedModelInfo }[] {
  return (Object.keys(MODEL_REGISTRY) as ModelKey[]).map((key) => ({ key, info: MODEL_REGISTRY[key] }));
}

// 明示解決（フォールバックなし）
export function resolveModel(modelType?: string): ResolvedModel {
  if (!modelType) {
    throw new Error('Model key is required. Use one of: ' + (Object.keys(MODEL_REGISTRY) as string[]).join(', '));
  }
  const key = modelType as ModelKey;
  const def = MODEL_REGISTRY[key];
  if (!def) {
    throw new Error(`Unsupported model key: ${modelType}. Available: ${(Object.keys(MODEL_REGISTRY) as string[]).join(', ')}`);
  }

  switch (def.provider) {
    case 'OpenAI':
      return { aiModel: openai(def.modelId), info: { ...def, key } };
    case 'Google':
      return { aiModel: google(def.modelId) as unknown as AnyModel, info: { ...def, key } };
    case 'Anthropic':
      return { aiModel: anthropic(def.modelId) as unknown as AnyModel, info: { ...def, key } };
    default:
      throw new Error(`Unknown provider for model ${modelType}: ${def.provider}`);
  }
}

// 明示解決（フォールバックなし）かつオプション上書き対応
export function resolveModelWithOptions(
  modelType?: string,
  overrideOptions?: Record<string, unknown>
): ResolvedModel {
  if (!modelType) {
    throw new Error('Model key is required. Use one of: ' + (Object.keys(MODEL_REGISTRY) as string[]).join(', '));
  }
  const key = modelType as ModelKey;
  const def = MODEL_REGISTRY[key];
  if (!def) {
    throw new Error(`Unsupported model key: ${modelType}. Available: ${(Object.keys(MODEL_REGISTRY) as string[]).join(', ')}`);
  }

  // shallow merge: overrideOptions overwrites defaults
  const mergedOptions = { ...(def.options || {}), ...(overrideOptions || {}) } as any;

  switch (def.provider) {
    case 'OpenAI':
      // openai() にはモデルIDのみを渡す。オプションは生成時に利用する想定。
      return { aiModel: openai(def.modelId), info: { ...def, key } };
    case 'Google':
      return { aiModel: google(def.modelId) as unknown as AnyModel, info: { ...def, key } };
    case 'Anthropic':
      return { aiModel: anthropic(def.modelId) as unknown as AnyModel, info: { ...def, key } };
    default:
      throw new Error(`Unknown provider for model ${modelType}: ${def.provider}`);
  }
}
