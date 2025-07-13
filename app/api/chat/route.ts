import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RuntimeContext } from "@mastra/core/di";
import { createGeneralAgent } from "@/src/mastra/agents/general-agent";

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

    const { message, threadId, model } = await req.json();

    if (!message) {
      console.log("Chat API: Message is required");
      return new Response("Message is required", { status: 400 });
    }

    console.log("Chat API: Message received:", message);
    console.log("Chat API: ThreadId:", threadId);
    console.log("Chat API: Selected model:", model || "claude-sonnet-4");

    // Create agent with selected model
    const agent = createGeneralAgent(model || 'claude-sonnet-4');
    
    // モデル情報を取得してログ出力
    const modelInfo = (agent as { _modelInfo?: { displayName: string; provider: string; modelId: string } })._modelInfo;
    if (modelInfo) {
      console.log(`🎯 Chat API: 実際のモデル: ${modelInfo.displayName}`);
      console.log(`🎯 Provider: ${modelInfo.provider}, Model ID: ${modelInfo.modelId}`);
    } else {
      console.log(`Chat API: Agent created with ${model || "claude-sonnet-4"} model`);
    }

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
          
          // ストリーム開始時にモデル情報を送信
          if (modelInfo) {
            const modelEvent = JSON.stringify({
              type: 'model-info',
              provider: modelInfo.provider,
              modelId: modelInfo.modelId,
              displayName: modelInfo.displayName
            }) + '\n';
            controller.enqueue(encoder.encode(modelEvent));
            console.log(`📡 モデル情報をクライアントに送信: ${modelInfo.displayName}`);
          }
          
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
          
          // Mastraのデバッグログがモデル情報を出力する
          console.log(`📝 Mastraのデバッグログでモデル名を確認してください`);
          console.log(`📝 環境変数 LOG_LEVEL=debug を設定するか、Pinoログの出力を確認してください`);
          
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