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
    const jobResult = getJobResult(jobId);
    
    if (!jobResult) {
      console.log(`❌ ジョブ結果が見つかりません: ${jobId}`);
      return new Response("Job result not found", { status: 404 });
    }
    
    // スライド生成ワークフローの結果のみ返す
    if (jobResult.workflowId !== 'slideGenerationWorkflow') {
      console.log(`❌ スライド生成ジョブではありません: ${jobId}`);
      return new Response("Not a slide generation job", { status: 400 });
    }
    
    const slideResult = jobResult.result;
    
    if (!slideResult || typeof slideResult !== 'object' || 
        !('htmlCode' in slideResult) || !slideResult.htmlCode) {
      console.log(`❌ HTMLコードが見つかりません: ${jobId}`);
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