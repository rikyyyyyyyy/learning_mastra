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
    
    // スライド生成ワークフローの結果をチェック
    let slideResult = jobResult.result;
    let isSlideGenerationJob = false;
    
    // agent-networkワークフロー経由のスライド生成の場合
    if (jobResult.workflowId === 'agent-network-workflow' && 
             slideResult && typeof slideResult === 'object' &&
             'steps' in slideResult && 
             slideResult.steps && typeof slideResult.steps === 'object' &&
             'agent-network-execution' in slideResult.steps) {
      const executionStep = slideResult.steps['agent-network-execution'] as { 
        output?: { taskType?: string; result?: unknown } 
      };
      if (executionStep.output?.taskType === 'slide-generation') {
        isSlideGenerationJob = true;
        // agent-networkワークフローの結果から実際のスライド結果を取得
        slideResult = executionStep.output.result;
      }
    }
    
    if (!isSlideGenerationJob) {
      console.log(`❌ スライド生成ジョブではありません: ${jobId} (workflowId: ${jobResult.workflowId})`);
      return new Response("Not a slide generation job", { status: 400 });
    }
    
    if (!slideResult || typeof slideResult !== 'object' || 
        !('htmlCode' in slideResult) || !slideResult.htmlCode) {
      console.log(`❌ HTMLコードが見つかりません: ${jobId}`);
      console.log(`slideResult:`, JSON.stringify(slideResult, null, 2));
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