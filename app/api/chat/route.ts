import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RuntimeContext } from "@mastra/core/di";
import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { sharedMemory } from "@/src/mastra/shared-memory";
import { weatherTool } from "@/src/mastra/tools/weather-tool";
import { webSearchTool } from "@/src/mastra/tools/web-search-tool";
import { slideGenerationTool } from "@/src/mastra/tools/slide-generation-tool";
import { slidePreviewTool } from "@/src/mastra/tools/slide-preview-tool";
import { jobStatusTool } from "@/src/mastra/tools/job-status-tool";
import { jobResultTool } from "@/src/mastra/tools/job-result-tool";

export async function POST(req: NextRequest) {
  try {
    console.log("Chat API: Request received");
    
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log("Chat API: Authentication failed", authError);
      return new Response("Unauthorized", { status: 401 });
    }
    
    console.log("Chat API: User authenticated:", user.id);

    const { message, threadId } = await req.json();

    if (!message) {
      console.log("Chat API: Message is required");
      return new Response("Message is required", { status: 400 });
    }

    console.log("Chat API: Message received:", message);
    console.log("Chat API: ThreadId:", threadId);

    // Create agent with Claude 4 Sonnet
    const agent = new Agent({
      name: 'General AI Assistant',
      instructions: `
        あなたは親切で知識豊富なAIアシスタントです。ユーザーの質問に対して、正確で役立つ情報を提供します。

        主な機能：
        - 一般的な質問への回答
        - タスクの計画と管理のサポート
        - 天気情報の提供（weatherToolを使用）
        - Web検索の実行（webSearchToolを使用）
        - スライド生成（slideGenerationToolを使用）
        - スライドプレビュー（slidePreviewToolを使用）
        - ジョブ状態の確認（jobStatusToolを使用）
        - ワークフロー結果の取得（jobResultToolを使用）
        - アイデアのブレインストーミング
        - 文章の作成と編集の支援
        - 技術的な質問への回答

        対応ガイドライン：
        - 常に丁寧で親しみやすい口調を保つ
        - 質問が不明確な場合は、詳細を尋ねる
        - 複雑なタスクは段階的に分解して説明する
        - 可能な限り具体的で実用的なアドバイスを提供する
        - ユーザーのニーズに合わせて回答の詳細度を調整する
        - 天気に関する質問にはweatherToolを使用して最新の情報を提供する
        - Web検索が必要な場合はwebSearchToolを使用してジョブを登録する
        - スライド作成が必要な場合はslideGenerationToolを使用してジョブを登録する
        - スライドのHTMLコードが生成された場合、必ずslidePreviewToolを使用してプレビューを準備する
        - jobResultToolでslideGenerationWorkflowの結果を取得したら、即座にslidePreviewToolを実行する
        - slidePreviewToolはプレビュー表示のトリガーなので、必ず実行する

        【重要】効率的なジョブ監視プロセス：
        - ユーザーが「結果は？」「どうなった？」など、ジョブの結果を尋ねた場合のみjobStatusToolを使用する
        - ジョブを開始した直後は、ユーザーに「ジョブを開始しました」と報告するだけで十分
        - ジョブの実行中は、ユーザーからの新しい質問に通常通り応答する
        - ジョブが完了したかどうかの確認は、ユーザーが明示的に尋ねた場合のみ行う
        - 過剰なステータスチェックは避ける（連続して複数回チェックしない）

        ジョブ結果取得時の手順：
        1. ユーザーがジョブの結果を尋ねた場合、jobStatusToolを1回だけ使用
        2. ジョブが完了していればjobResultToolで結果を取得
        3. **重要**: slideGenerationWorkflowの結果を取得した場合は、必ずslidePreviewToolを実行
        4. 取得した結果をユーザーに報告
        5. ジョブがまだ実行中の場合は、その旨を伝えて、後で確認するよう案内

        注意事項：
        - 個人情報や機密情報を要求しない
        - 医療、法律、金融に関する専門的なアドバイスは提供しない（一般的な情報のみ）
        - 常に事実に基づいた情報を提供し、不確かな場合はその旨を明記する
        - Web検索ツールは即座にjobIdを返すが、実際の結果は後で取得する必要がある
        - スライド生成ツールも即座にjobIdを返すが、実際の結果は後で取得する必要がある
        - スライドのHTMLコードが生成された場合、必ずslidePreviewToolを実行してプレビューを準備する
        - jobResultToolでworkflowIdが'slideGenerationWorkflow'の結果を取得した場合、必ずその直後にslidePreviewToolを実行する
        - slidePreviewToolはプレビュー表示のトリガーとして機能するため、スライド生成結果を取得したら必ず実行する
      `,
      model: anthropic("claude-sonnet-4-20250514"),
      tools: { weatherTool, webSearchTool, slideGenerationTool, slidePreviewTool, jobStatusTool, jobResultTool },
      memory: sharedMemory,
    });

    console.log("Chat API: Agent created with Claude 4 Sonnet");

    // RuntimeContextを作成してresourceIdとthreadIdを設定
    const runtimeContext = new RuntimeContext();
    runtimeContext.set('resourceId', user.id);
    runtimeContext.set('threadId', threadId || `thread-${Date.now()}`);
    
    console.log("Chat API: RuntimeContext created with resourceId:", user.id, "threadId:", threadId || `thread-${Date.now()}`);

    // Use stream() with memory parameters and runtime context
    const stream = await agent.stream(message, {
      memory: {
        thread: threadId || `thread-${Date.now()}`, // デフォルトのthreadIdを生成
        resource: user.id, // ユーザーIDをresourceIdとして使用
      },
      runtimeContext, // RuntimeContextを追加
    });
    
    console.log("Chat API: Stream created successfully with memory and runtime context");

    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        try {
          let textBuffer = '';
          const executedTools: string[] = [];
          
          // ストリーム全体を処理
          for await (const chunk of stream.fullStream) {
            // テキストチャンクの場合
            if (chunk.type === 'text-delta') {
              textBuffer += chunk.textDelta;
              // テキストの差分をJSONイベントとして送信
              const event = JSON.stringify({
                type: 'text',
                content: chunk.textDelta
              }) + '\n';
              controller.enqueue(encoder.encode(event));
            }
            
            // ツール呼び出しの場合
            if (chunk.type === 'tool-call') {
              console.log(`🔧 ツール呼び出しチャンク:`, chunk);
              const toolName = chunk.toolName;
              executedTools.push(toolName);
              console.log(`🔧 ツール実行: ${toolName}`);
              
              // ツール実行イベントを送信
              const event = JSON.stringify({
                type: 'tool-execution',
                toolName: toolName,
                args: chunk.args
              }) + '\n';
              controller.enqueue(encoder.encode(event));
            }
            
            // ツール結果の場合
            if (chunk.type === 'tool-result') {
              console.log(`📊 ツール結果:`, chunk);
              console.log(`📊 ツール名:`, chunk.toolName);
              console.log(`📊 結果詳細:`, chunk.result);
              
              // slidePreviewToolの結果を特別に処理
              // ツール名の複数パターンをチェック
              const isSlidePreviewTool = 
                chunk.toolName === 'slide-preview-display' || 
                chunk.toolName === 'slidePreviewTool' ||
                chunk.toolName === 'slide-preview-tool';
                
              if (isSlidePreviewTool && chunk.result?.previewReady) {
                console.log(`🎨 スライドプレビューイベントを送信: ${chunk.result.jobId}`);
                const event = JSON.stringify({
                  type: 'slide-preview-ready',
                  jobId: chunk.result.jobId
                }) + '\n';
                controller.enqueue(encoder.encode(event));
              }
            }
          }
          
          // 最終的なメッセージ情報を送信
          const finalEvent = JSON.stringify({
            type: 'message-complete',
            executedTools: executedTools,
            content: textBuffer
          }) + '\n';
          controller.enqueue(encoder.encode(finalEvent));
          
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}