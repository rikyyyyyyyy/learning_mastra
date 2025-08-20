/**
 * 共有コンテキストユーティリティ
 * 全エージェント間で共有される時刻・環境情報を管理
 */

import { RuntimeContext } from '@mastra/core/di';
import os from 'os';

/**
 * システムコンテキスト情報
 */
export interface SystemContext {
  timestamp: string;          // ISO 8601形式のタイムスタンプ
  timezone: string;           // タイムゾーン
  locale: string;             // ロケール（言語・地域）
  platform: string;           // OS情報
  hostname: string;           // ホスト名
  userAgent?: string;         // ユーザーエージェント（ブラウザの場合）
  country?: string;           // 国（推定）
  language: string;           // 言語設定
}

/**
 * 現在のシステムコンテキストを取得
 */
export function getSystemContext(): SystemContext {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = process.env.LANG || process.env.LC_ALL || 'ja-JP';
  
  // 国と言語を推定
  const language = locale.split('_')[0] || 'ja';
  const country = (() => {
    // タイムゾーンから国を推定
    if (timezone.includes('Tokyo')) return 'Japan';
    if (timezone.includes('Shanghai') || timezone.includes('Beijing')) return 'China';
    if (timezone.includes('Seoul')) return 'Korea';
    if (timezone.includes('New_York') || timezone.includes('Los_Angeles')) return 'USA';
    if (timezone.includes('London')) return 'UK';
    // ロケールから推定
    if (locale.includes('JP')) return 'Japan';
    if (locale.includes('CN')) return 'China';
    if (locale.includes('KR')) return 'Korea';
    if (locale.includes('US')) return 'USA';
    if (locale.includes('GB')) return 'UK';
    return 'Unknown';
  })();
  
  return {
    timestamp: now.toISOString(),
    timezone,
    locale,
    platform: `${os.platform()} ${os.release()}`,
    hostname: os.hostname(),
    country,
    language,
  };
}

/**
 * コンテキスト情報をフォーマットした文字列を生成
 */
export function formatSystemContext(context: SystemContext): string {
  const localTime = new Date(context.timestamp).toLocaleString('ja-JP', {
    timeZone: context.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  return `
【システムコンテキスト】
現在時刻: ${localTime} (${context.timezone})
国/地域: ${context.country}
言語: ${context.language}
プラットフォーム: ${context.platform}
ホスト名: ${context.hostname}
`.trim();
}

/**
 * RuntimeContextにシステムコンテキストを追加
 */
export function injectSystemContext(runtimeContext: RuntimeContext): RuntimeContext {
  const systemContext = getSystemContext();
  
  // 各フィールドを個別に設定（他のツールからアクセスしやすくするため）
  runtimeContext.set('systemTimestamp', systemContext.timestamp);
  runtimeContext.set('systemTimezone', systemContext.timezone);
  runtimeContext.set('systemLocale', systemContext.locale);
  runtimeContext.set('systemPlatform', systemContext.platform);
  runtimeContext.set('systemCountry', systemContext.country);
  runtimeContext.set('systemLanguage', systemContext.language);
  
  // 完全なコンテキストオブジェクトも保存
  runtimeContext.set('systemContext', systemContext);
  
  return runtimeContext;
}

/**
 * RuntimeContextからシステムコンテキストを取得
 */
export function extractSystemContext(runtimeContext: RuntimeContext): SystemContext | null {
  const context = runtimeContext.get('systemContext') as SystemContext | undefined;
  if (context) return context;
  
  // 個別フィールドから再構築
  const timestamp = runtimeContext.get('systemTimestamp') as string | undefined;
  if (!timestamp) return null;
  
  return {
    timestamp,
    timezone: runtimeContext.get('systemTimezone') as string || 'Asia/Tokyo',
    locale: runtimeContext.get('systemLocale') as string || 'ja-JP',
    platform: runtimeContext.get('systemPlatform') as string || 'unknown',
    hostname: runtimeContext.get('systemHostname') as string || 'unknown',
    country: runtimeContext.get('systemCountry') as string || 'Japan',
    language: runtimeContext.get('systemLanguage') as string || 'ja',
  };
}