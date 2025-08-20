"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, AlertCircle, CheckCircle, XCircle, Clock, MessageSquare, TrendingUp, AlertTriangle, Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NetworkDirective {
  directive_id: string;
  network_id: string;
  directive_content: string;
  directive_type: 'policy_update' | 'task_addition' | 'priority_change' | 'abort' | 'other';
  source: string;
  status: 'pending' | 'acknowledged' | 'applied' | 'rejected';
  created_at: string;
  updated_at: string;
  acknowledged_at?: string;
  applied_at?: string;
  metadata?: Record<string, unknown>;
}

interface DirectiveSummary {
  total?: number;
  totalForNetwork?: number;
  pending?: number;
  acknowledged?: number;
  applied?: number;
  rejected?: number;
  hasUnacknowledged?: boolean;
  unacknowledged?: number;
  networks?: number;
}

const statusIcons = {
  pending: <Clock className="w-4 h-4" />,
  acknowledged: <AlertCircle className="w-4 h-4" />,
  applied: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />
};

const statusColors = {
  pending: "bg-yellow-500",
  acknowledged: "bg-blue-500",
  applied: "bg-green-500",
  rejected: "bg-red-500"
};

const statusBadgeColors = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  acknowledged: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  applied: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
};

const typeIcons = {
  policy_update: <TrendingUp className="w-4 h-4" />,
  task_addition: <MessageSquare className="w-4 h-4" />,
  priority_change: <AlertTriangle className="w-4 h-4" />,
  abort: <Ban className="w-4 h-4" />,
  other: <AlertCircle className="w-4 h-4" />
};

const typeColors = {
  policy_update: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  task_addition: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  priority_change: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  abort: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-muted text-muted-foreground"
};

const typeLabels = {
  policy_update: "ポリシー更新",
  task_addition: "タスク追加",
  priority_change: "優先度変更",
  abort: "中止",
  other: "その他"
};

export function DirectiveViewer({ networkId }: { networkId?: string }) {
  const [directives, setDirectives] = useState<NetworkDirective[]>([]);
  const [groupedDirectives, setGroupedDirectives] = useState<Record<string, NetworkDirective[]>>({});
  const [summary, setSummary] = useState<DirectiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirectives, setExpandedDirectives] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

  const fetchDirectives = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const url = networkId 
        ? `/api/db-viewer/directives?networkId=${networkId}`
        : '/api/db-viewer/directives';
        
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch directives');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setDirectives(data.directives);
        setGroupedDirectives(data.groupedByNetwork);
        setSummary(data.summary);
      } else {
        throw new Error(data.error || 'Failed to fetch directives');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectives();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDirectives, 5000); // 5秒ごとに更新
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId, autoRefresh]);

  const toggleDirectiveExpansion = (directiveId: string) => {
    setExpandedDirectives(prev => {
      const newSet = new Set(prev);
      if (newSet.has(directiveId)) {
        newSet.delete(directiveId);
      } else {
        newSet.add(directiveId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}時間${minutes % 60}分前`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒前`;
    } else {
      return `${seconds}秒前`;
    }
  };

  if (loading && directives.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-red-500">
            <p className="mb-4">エラー: {error}</p>
            <Button onClick={fetchDirectives} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              再試行
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderDirective = (directive: NetworkDirective) => (
    <div
      key={directive.directive_id}
      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[directive.status]}`} />
            {statusIcons[directive.status]}
            
            <Badge variant="outline" className={statusBadgeColors[directive.status]}>
              {directive.status === 'pending' ? '未確認' :
               directive.status === 'acknowledged' ? '確認済み' :
               directive.status === 'applied' ? '適用済み' : '却下'}
            </Badge>
            
            <div className="flex items-center gap-1">
              {typeIcons[directive.directive_type]}
              <Badge variant="secondary" className={typeColors[directive.directive_type]}>
                {typeLabels[directive.directive_type]}
              </Badge>
            </div>
            
            <Badge variant="outline">
              送信元: {directive.source}
            </Badge>
          </div>
          
          <div className="ml-10">
            <p className="text-sm font-medium mb-2">{directive.directive_content}</p>
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>作成: {formatDate(directive.created_at)}</span>
              {directive.status === 'pending' && (
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                  {formatDuration(directive.created_at)}
                </span>
              )}
              {directive.acknowledged_at && (
                <span>確認: {formatDate(directive.acknowledged_at)}</span>
              )}
              {directive.applied_at && (
                <span>適用: {formatDate(directive.applied_at)}</span>
              )}
            </div>
            
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ネットワーク:</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">{directive.network_id}</code>
            </div>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleDirectiveExpansion(directive.directive_id)}
        >
          詳細
        </Button>
      </div>
      
      {expandedDirectives.has(directive.directive_id) && (
        <div className="mt-4 ml-10 p-4 bg-muted/50 rounded-lg">
          <div className="space-y-2">
            <div>
              <span className="font-medium text-sm">指令ID:</span>
              <span className="text-sm ml-2 font-mono">{directive.directive_id}</span>
            </div>
            
            <div>
              <span className="font-medium text-sm">更新日時:</span>
              <span className="text-sm ml-2">{formatDate(directive.updated_at)}</span>
            </div>
            
            {directive.metadata && Object.keys(directive.metadata).length > 0 && (
              <div>
                <span className="font-medium text-sm">メタデータ:</span>
                <pre className="text-xs mt-1 p-2 bg-background rounded border overflow-x-auto">
                  {JSON.stringify(directive.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="bg-card text-card-foreground">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>追加指令管理</CardTitle>
            <CardDescription>
              {networkId ? `ネットワーク: ${networkId}` : 'すべての追加指令'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'list' ? 'grouped' : 'list')}
            >
              {viewMode === 'list' ? 'リスト表示' : 'グループ表示'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'bg-green-500/10' : ''}
            >
              {autoRefresh ? '自動更新ON' : '自動更新OFF'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchDirectives}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {summary.totalForNetwork !== undefined && (
              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm text-muted-foreground">合計</div>
                <div className="text-2xl font-bold">{summary.totalForNetwork}</div>
              </div>
            )}
            {summary.pending !== undefined && (
              <div className="bg-yellow-500/10 rounded-lg p-3">
                <div className="text-sm text-yellow-600 dark:text-yellow-400">未確認</div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.pending}</div>
              </div>
            )}
            {summary.acknowledged !== undefined && (
              <div className="bg-blue-500/10 rounded-lg p-3">
                <div className="text-sm text-blue-600 dark:text-blue-400">確認済み</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.acknowledged}</div>
              </div>
            )}
            {summary.applied !== undefined && (
              <div className="bg-green-500/10 rounded-lg p-3">
                <div className="text-sm text-green-600 dark:text-green-400">適用済み</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.applied}</div>
              </div>
            )}
            {summary.rejected !== undefined && (
              <div className="bg-red-500/10 rounded-lg p-3">
                <div className="text-sm text-red-600 dark:text-red-400">却下</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.rejected}</div>
              </div>
            )}
            {summary.networks !== undefined && (
              <div className="bg-purple-500/10 rounded-lg p-3">
                <div className="text-sm text-purple-600 dark:text-purple-400">ネットワーク数</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.networks}</div>
              </div>
            )}
          </div>
        )}

        {summary?.hasUnacknowledged && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-300">未確認の指令があります</span>
          </div>
        )}

        <div className="space-y-3">
          {viewMode === 'list' ? (
            directives.map(renderDirective)
          ) : (
            Object.entries(groupedDirectives).map(([networkId, networkDirectives]) => (
              <div key={networkId} className="border rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <span>ネットワーク:</span>
                  <code className="text-sm bg-muted px-2 py-1 rounded">{networkId}</code>
                  <Badge variant="outline">{networkDirectives.length}件</Badge>
                </h3>
                <div className="space-y-2">
                  {networkDirectives.map(renderDirective)}
                </div>
              </div>
            ))
          )}
        </div>
        
        {directives.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            追加指令がありません
          </div>
        )}
      </CardContent>
    </Card>
  );
}