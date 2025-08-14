import { NextRequest, NextResponse } from 'next/server';
import { jobStore } from '@/src/mastra/services/job-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // DBからジョブ結果を取得
    const jobResult = await jobStore.getResult(jobId);
    if (!jobResult) {
      return NextResponse.json({ error: 'Job result not found' }, { status: 404 });
    }
    
    // エージェント会話履歴を抽出
    const conversationHistory = (jobResult.result as any)?.conversationHistory || [];
    
    // 会話ログの統計情報を計算
    const conversationStats = {
      totalMessages: conversationHistory.length,
      messagesByAgent: conversationHistory.reduce((acc: Record<string, number>, entry: { agentId: string }) => {
        acc[entry.agentId] = (acc[entry.agentId] || 0) + 1;
        return acc;
      }, {}),
      messagesByType: conversationHistory.reduce((acc: Record<string, number>, entry: { messageType?: string }) => {
        const type = entry.messageType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      totalIterations: conversationHistory.length > 0 ? 
        Math.max(...conversationHistory.map((entry: { iteration?: number }) => entry.iteration || 0)) : 0,
    };
    
    // ジョブメタデータも含める
    const response = {
      jobId,
      taskType: (jobResult.result as any)?.taskType || 'unknown',
      success: (jobResult.result as any)?.success || false,
      conversationHistory,
      conversationStats,
      executionSummary: (jobResult.result as any)?.executionSummary || null,
      timestamp: jobResult.created_at || new Date().toISOString(),
      // デバッグ情報（環境変数が設定されている場合）
      debug: process.env.AGENT_NETWORK_DEBUG === 'true' ? {
        rawResult: jobResult.result,
      } : undefined,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching agent logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent logs' },
      { status: 500 }
    );
  }
}