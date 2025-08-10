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
    
    const directiveDAO = getDAOs().directives;
    
    let directives;
    let summary;
    
    if (networkId) {
      // 特定のネットワークの指令を取得
      if (status === 'pending') {
        directives = await directiveDAO.findPendingByNetworkId(networkId);
      } else {
        directives = await directiveDAO.findByNetworkId(networkId);
      }
      
      const hasUnacknowledged = await directiveDAO.hasUnacknowledgedDirectives(networkId);
      
      summary = {
        totalForNetwork: directives.length,
        pending: directives.filter(d => d.status === 'pending').length,
        acknowledged: directives.filter(d => d.status === 'acknowledged').length,
        applied: directives.filter(d => d.status === 'applied').length,
        rejected: directives.filter(d => d.status === 'rejected').length,
        hasUnacknowledged
      };
    } else {
      // すべての未確認指令を取得
      const unacknowledged = await directiveDAO.findUnacknowledged();
      
      // その他の指令も含めて取得（実装が必要な場合）
      directives = unacknowledged.slice(offset, offset + limit);
      
      summary = {
        total: unacknowledged.length,
        unacknowledged: unacknowledged.length,
        networks: [...new Set(unacknowledged.map(d => d.network_id))].length
      };
    }
    
    // ネットワークごとにグループ化
    const groupedByNetwork = directives.reduce((acc, directive) => {
      if (!acc[directive.network_id]) {
        acc[directive.network_id] = [];
      }
      acc[directive.network_id].push(directive);
      return acc;
    }, {} as Record<string, typeof directives>);
    
    return NextResponse.json({
      success: true,
      directives,
      groupedByNetwork,
      summary,
      pagination: {
        limit,
        offset,
        hasMore: directives.length === limit
      }
    });
    
  } catch (error) {
    console.error('Error fetching directives:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch directives',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}