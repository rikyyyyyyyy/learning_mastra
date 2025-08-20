import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getJobResult } from './job-status-tool';

// マークダウンコードブロックを除去するヘルパー関数
function cleanHtmlCode(htmlCode: string): string {
  // ```html または ```HTML で始まり ``` で終わる場合、その部分を除去
  const codeBlockPattern = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```\s*$/;
  const match = htmlCode.match(codeBlockPattern);
  if (match) {
    return match[1].trim();
  }
  return htmlCode;
}

// HTMLコードを再帰的に探すヘルパー関数
function findHtmlCode(obj: unknown, depth = 0): string | null {
  if (depth > 5) return null; // 無限ループ防止
  
  if (typeof obj === 'string') {
    // 文字列がHTMLっぽいか確認
    if (obj.includes('<!DOCTYPE') || obj.includes('<html')) {
      return cleanHtmlCode(obj);
    }
    return null;
  }
  
  if (typeof obj !== 'object' || obj === null) {
    return null;
  }
  
  const record = obj as Record<string, unknown>;
  
  // htmlCode フィールドを直接探す
  if ('htmlCode' in record && typeof record.htmlCode === 'string') {
    return cleanHtmlCode(record.htmlCode as string);
  }
  
  // result フィールドを探す
  if ('result' in record) {
    const found = findHtmlCode(record.result, depth + 1);
    if (found) return found;
  }
  
  // artifact フィールドを探す
  if ('artifact' in record) {
    const found = findHtmlCode(record.artifact, depth + 1);
    if (found) return found;
  }
  
  return null;
}

export const slidePreviewTool = createTool({
  id: 'slide-preview-display',
  description: 'スライドプレビューを表示するためのトリガーツールです。このツールが実行されると、フロントエンドが自動的にスライドのプレビューを表示します。',
  inputSchema: z.object({
    jobId: z.string().describe('プレビューしたいスライド生成ジョブのID'),
  }),
  outputSchema: z.object({
    jobId: z.string(),
    previewReady: z.boolean(),
    message: z.string(),
    debugInfo: z.object({
      workflowId: z.string().optional(),
      taskType: z.string().optional(),
      htmlFound: z.boolean().optional(),
    }).optional(),
  }),
  execute: async ({ context }) => {
    const { jobId } = context;
    
    console.log(`🖼️ スライドプレビュートリガー実行 (jobId: ${jobId})`);
    
    // ジョブ結果の存在確認
    const jobResult = await getJobResult(jobId);
    
    if (!jobResult) {
      return {
        jobId,
        previewReady: false,
        message: `ジョブID「${jobId}」の結果が見つかりません。スライド生成が完了していない可能性があります。`,
      };
    }
    
    const workflowId = jobResult.workflowId;
    const debugInfo: { workflowId?: string; taskType?: string; htmlFound?: boolean } = {
      workflowId,
    };
    
    console.log(`📊 ワークフローID: ${workflowId}`);
    
    // タスクタイプの確認（スライド関連のタスクか）
    let isSlideTask = false;
    let taskType: string | undefined;
    
    // jobIdがslide-generationを含むか確認
    if (jobId.includes('slide-generation')) {
      isSlideTask = true;
      taskType = 'slide-generation';
    }
    
    // result内のtaskTypeを確認
    if (!isSlideTask && jobResult.result && typeof jobResult.result === 'object') {
      const result = jobResult.result as Record<string, unknown>;
      if ('taskType' in result) {
        taskType = result.taskType as string;
        if (taskType === 'slide-generation' || taskType?.includes('slide')) {
          isSlideTask = true;
        }
      }
    }
    
    debugInfo.taskType = taskType;
    console.log(`📝 タスクタイプ: ${taskType}`);
    
    // HTMLコードを再帰的に探す
    const htmlCode = findHtmlCode(jobResult.result);
    debugInfo.htmlFound = !!htmlCode;
    
    if (htmlCode) {
      console.log(`✅ HTMLコード発見 (長さ: ${htmlCode.length}文字)`);
      
      // HTMLコードが有効か簡単にチェック
      if (htmlCode.includes('<!DOCTYPE') || htmlCode.includes('<html')) {
        console.log(`✅ スライドプレビュー準備完了 (jobId: ${jobId})`);
        
        return {
          jobId,
          previewReady: true,
          message: `スライドプレビューの準備が完了しました。プレビューが自動的に表示されます。`,
          debugInfo,
        };
      } else {
        console.log(`⚠️ HTMLコードが不完全な可能性があります`);
      }
    }
    
    // HTMLが見つからない場合
    console.log(`❌ HTMLコードが見つかりません`);
    console.log(`📋 デバッグ情報:`, debugInfo);
    
    return {
      jobId,
      previewReady: false,
      message: isSlideTask 
        ? `ジョブID「${jobId}」のスライドHTMLコードが見つかりません。生成結果を確認してください。`
        : `ジョブID「${jobId}」はスライド生成タスクではない可能性があります。`,
      debugInfo,
    };
  },
}); 