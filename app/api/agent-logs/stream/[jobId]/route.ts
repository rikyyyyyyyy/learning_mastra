import { NextRequest, NextResponse } from 'next/server';
import { agentLogStore, type AgentConversationEntry } from '@/src/mastra/utils/agent-log-store';

// SSEヘッダーの設定
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Nginxのバッファリングを無効化
};

// SSEメッセージをフォーマット
function formatSSEMessage(event: string, data: unknown): string {
  const lines = JSON.stringify(data).split('\n');
  let message = `event: ${event}\n`;
  lines.forEach(line => {
    message += `data: ${line}\n`;
  });
  message += '\n';
  return message;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    console.log(`🌐 SSE接続リクエスト受信: ${jobId}`);
    console.log(`🌐 Request headers:`, Object.fromEntries(request.headers.entries()));
    console.log(`🌐 現在のジョブ一覧:`, agentLogStore.getRunningJobs());
    console.log(`🌐 すべてのジョブ:`, Array.from(agentLogStore.getAllJobs().keys()));
  
  // ジョブが存在するか確認
  let jobLog = agentLogStore.getJobLog(jobId);
  
  // ジョブがまだ存在しない場合は少し待つ
  if (!jobLog) {
    console.log(`⏳ ジョブがまだ存在しません。1秒待機中: ${jobId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    jobLog = agentLogStore.getJobLog(jobId);
  }
  
  if (!jobLog) {
    console.error(`❌ ジョブが見つかりません: ${jobId}`);
    return NextResponse.json(
      { 
        error: 'Job not found',
        requestedJobId: jobId,
        availableJobs: Array.from(agentLogStore.getAllJobs().keys())
      },
      { status: 404 }
    );
  }
  
  console.log(`✅ ジョブが見つかりました: ${jobId}, status: ${jobLog.status}`);

  // ReadableStreamを作成
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // 接続確立メッセージを送信
      controller.enqueue(
        encoder.encode(formatSSEMessage('connected', {
          jobId,
          taskType: jobLog.taskType,
          status: jobLog.status,
          startTime: jobLog.startTime,
        }))
      );
      
      // 既存の会話履歴を送信
      if (jobLog.conversationHistory.length > 0) {
        controller.enqueue(
          encoder.encode(formatSSEMessage('history', {
            conversationHistory: jobLog.conversationHistory,
            count: jobLog.conversationHistory.length,
          }))
        );
      }
      
      // リアルタイムログのリスナーを設定
      const handleLogAdded = (logJobId: string, entry: AgentConversationEntry) => {
        console.log(`📤 [SSE] ログイベント受信: jobId=${logJobId}, target=${jobId}, match=${logJobId === jobId}`);
        if (logJobId === jobId) {
          try {
            const message = formatSSEMessage('log-entry', {
              jobId,
              entry,
              timestamp: new Date().toISOString(),
            });
            console.log(`📤 [SSE] ログエントリ送信: ${entry.agentName} - ${entry.message.substring(0, 50)}...`);
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            console.error(`❌ SSEエンキューエラー: ${error}`);
          }
        }
      };
      
      // ジョブ完了のリスナー
      const handleJobCompleted = (completedJobId: string) => {
        if (completedJobId === jobId) {
          const finalLog = agentLogStore.getJobLog(jobId);
          try {
            controller.enqueue(
              encoder.encode(formatSSEMessage('job-completed', {
                jobId,
                executionSummary: finalLog?.executionSummary,
                totalMessages: finalLog?.conversationHistory.length || 0,
                endTime: finalLog?.endTime,
              }))
            );
            // 完了後、接続を閉じる
            setTimeout(() => {
              controller.close();
            }, 1000);
          } catch (error) {
            console.error(`❌ SSE完了エラー: ${error}`);
          }
        }
      };
      
      // ジョブ失敗のリスナー
      const handleJobFailed = (failedJobId: string, error: string) => {
        if (failedJobId === jobId) {
          try {
            controller.enqueue(
              encoder.encode(formatSSEMessage('job-failed', {
                jobId,
                error,
                timestamp: new Date().toISOString(),
              }))
            );
            // 失敗後、接続を閉じる
            setTimeout(() => {
              controller.close();
            }, 1000);
          } catch (error) {
            console.error(`❌ SSE失敗エラー: ${error}`);
          }
        }
      };
      
      // イベントリスナーを登録
      agentLogStore.on('log-added', handleLogAdded);
      agentLogStore.on('job-completed', handleJobCompleted);
      agentLogStore.on('job-failed', handleJobFailed);
      
      // ハートビートを送信（30秒ごと）
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(formatSSEMessage('heartbeat', {
              timestamp: new Date().toISOString(),
              jobId,
            }))
          );
        } catch (error) {
          console.error(`❌ ハートビートエラー: ${error}`);
          clearInterval(heartbeatInterval);
        }
      }, 30000);
      
      // クリーンアップ処理
      request.signal.addEventListener('abort', () => {
        console.log(`🔌 SSE接続終了: ${jobId}`);
        agentLogStore.off('log-added', handleLogAdded);
        agentLogStore.off('job-completed', handleJobCompleted);
        agentLogStore.off('job-failed', handleJobFailed);
        clearInterval(heartbeatInterval);
        
        try {
          controller.close();
        } catch (error) {
          // Already closed
        }
      });
      
      // ジョブが既に完了している場合
      if (jobLog.status !== 'running') {
        setTimeout(() => {
          try {
            controller.enqueue(
              encoder.encode(formatSSEMessage('job-already-completed', {
                jobId,
                status: jobLog.status,
                endTime: jobLog.endTime,
              }))
            );
            controller.close();
          } catch (error) {
            console.error(`❌ SSE既完了エラー: ${error}`);
          }
        }, 100);
      }
    },
  });

  return new Response(stream, {
    headers: SSE_HEADERS,
  });
  } catch (error) {
    console.error('❌ SSEエンドポイントエラー:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}