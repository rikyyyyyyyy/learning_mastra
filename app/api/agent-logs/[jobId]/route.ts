import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // ジョブ結果ファイルのパスを構築
    const jobResultPath = path.join(process.cwd(), '.job-results', `${jobId}.json`);
    
    // ファイルが存在するか確認
    if (!fs.existsSync(jobResultPath)) {
      return NextResponse.json(
        { error: 'Job result not found' },
        { status: 404 }
      );
    }
    
    // ジョブ結果を読み込む
    const jobResultData = fs.readFileSync(jobResultPath, 'utf-8');
    const jobResult = JSON.parse(jobResultData);
    
    // エージェント会話履歴を抽出
    const conversationHistory = jobResult.result?.conversationHistory || [];
    
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
      taskType: jobResult.result?.taskType || 'unknown',
      success: jobResult.result?.success || false,
      conversationHistory,
      conversationStats,
      executionSummary: jobResult.result?.executionSummary || null,
      timestamp: jobResult.createdAt || new Date().toISOString(),
      // デバッグ情報（環境変数が設定されている場合）
      debug: process.env.AGENT_NETWORK_DEBUG === 'true' ? {
        rawResult: jobResult.result,
        fileSize: jobResultData.length,
        filePath: jobResultPath,
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