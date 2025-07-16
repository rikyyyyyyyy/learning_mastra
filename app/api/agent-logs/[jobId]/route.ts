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
    
    // ジョブメタデータも含める
    const response = {
      jobId,
      taskType: jobResult.result?.taskType || 'unknown',
      success: jobResult.result?.success || false,
      conversationHistory,
      executionSummary: jobResult.result?.executionSummary || null,
      timestamp: jobResult.createdAt || new Date().toISOString(),
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