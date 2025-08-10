import { NextRequest, NextResponse } from 'next/server';
import { getDAOs } from '@/src/mastra/task-management/db/dao';
import { initializeTaskManagementDB } from '@/src/mastra/task-management/db/migrations';

// Initialize database on first request
let dbInitialized = false;

async function ensureDBInitialized() {
  if (!dbInitialized) {
    await initializeTaskManagementDB(':memory:');
    dbInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Ensure database is initialized
    await ensureDBInitialized();
    
    const { searchParams } = new URL(request.url);
    const networkId = searchParams.get('networkId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const taskDAO = getDAOs().tasks;
    
    let tasks;
    let summary;
    
    if (networkId) {
      // 特定のネットワークのタスクを取得
      if (status) {
        tasks = await taskDAO.findByNetworkAndStatus(networkId, status as Parameters<typeof taskDAO.findByNetworkAndStatus>[1]);
      } else {
        tasks = await taskDAO.findByNetworkId(networkId);
      }
      summary = await taskDAO.getNetworkSummary(networkId);
    } else if (status) {
      // ステータスでフィルタ
      tasks = await taskDAO.findByStatus(status as Parameters<typeof taskDAO.findByStatus>[0]);
    } else {
      // すべてのタスクを取得（最新100件）
      const allTasks = await taskDAO.findByStatus('running');
      const queuedTasks = await taskDAO.findByStatus('queued');
      const completedTasks = await taskDAO.findByStatus('completed');
      const failedTasks = await taskDAO.findByStatus('failed');
      
      // Combine all tasks, but keep main network tasks for grouping purposes
      tasks = [...allTasks, ...queuedTasks, ...completedTasks.slice(0, 50), ...failedTasks.slice(0, 20)]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(offset, offset + limit);
        
      // 全体のサマリー
      summary = {
        total: tasks.length,
        running: allTasks.length,
        queued: queuedTasks.length,
        completed: completedTasks.length,
        failed: failedTasks.length,
        averageProgress: tasks.reduce((acc, task) => acc + task.progress, 0) / Math.max(tasks.length, 1)
      };
    }
    
    return NextResponse.json({
      success: true,
      tasks,
      summary,
      pagination: {
        limit,
        offset,
        hasMore: tasks.length === limit
      }
    });
    
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}