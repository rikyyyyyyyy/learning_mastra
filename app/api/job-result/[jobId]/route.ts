import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getJobResult } from "@/src/mastra/tools/job-status-tool";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    // Next.js 15ではparamsを非同期で扱う必要がある
    const { jobId } = await params;
    console.log(`📥 ジョブ結果取得リクエスト: ${jobId}`);
    
    // ジョブ結果を取得
    const jobResult = await getJobResult(jobId);
    
    if (!jobResult) {
      console.log(`❌ ジョブ結果が見つかりません: ${jobId}`);
      return new Response("Job result not found", { status: 404 });
    }
    
    // HTMLコードを再帰的に探すヘルパー関数
    function findHtmlCode(obj: unknown, depth = 0): { htmlCode: string } | null {
      if (depth > 5) return null; // 無限ループ防止
      
      if (typeof obj === 'string') {
        // 文字列がHTMLの場合（マークダウンラップも考慮）
        if (obj.includes('<!DOCTYPE') || obj.includes('<html')) {
          // マークダウンコードブロックを除去
          const codeBlockPattern = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```\s*$/;
          const match = obj.match(codeBlockPattern);
          const cleanHtml = match ? match[1].trim() : obj;
          return { htmlCode: cleanHtml };
        }
        return null;
      }
      
      if (typeof obj !== 'object' || obj === null) {
        return null;
      }
      
      const record = obj as Record<string, unknown>;
      
      // htmlCode フィールドを直接探す
      if ('htmlCode' in record && typeof record.htmlCode === 'string') {
        const htmlCode = record.htmlCode as string;
        // マークダウンコードブロックを除去
        const codeBlockPattern = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```\s*$/;
        const match = htmlCode.match(codeBlockPattern);
        const cleanHtml = match ? match[1].trim() : htmlCode;
        return { htmlCode: cleanHtml };
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
    
    // ワークフロー/ネットワーク共通でスライド結果を抽出
    const slideResult = findHtmlCode(jobResult.result);
    
    if (!slideResult) {
      console.log(`❌ HTMLコードが見つかりません: ${jobId}`);
      console.log(`Result structure:`, JSON.stringify(Object.keys(jobResult.result || {})));
      
      // デバッグ用: 結果の構造を詳細に出力
      if (jobResult.result && typeof jobResult.result === 'object') {
        const result = jobResult.result as Record<string, unknown>;
        if ('result' in result && result.result && typeof result.result === 'object') {
          console.log(`Result.result keys:`, Object.keys(result.result as Record<string, unknown>));
        }
      }
      
      return new Response("HTML code not found", { status: 404 });
    }

    // 型安全なアクセスのためのキャスト
    const typedSlideResult = slideResult as {
      htmlCode: string;
      topic?: string;
      slideCount?: number;
      style?: string;
      generationTime?: number;
    };
    
    console.log(`✅ ジョブ結果を返却: ${jobId} (HTMLサイズ: ${typedSlideResult.htmlCode.length}文字)`);
    
    // スライド結果を返す
    return new Response(JSON.stringify({
      jobId,
      htmlCode: typedSlideResult.htmlCode,
      topic: typedSlideResult.topic,
      slideCount: typedSlideResult.slideCount,
      style: typedSlideResult.style,
      generationTime: typedSlideResult.generationTime,
      completedAt: jobResult.completedAt,
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Job result API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
} 