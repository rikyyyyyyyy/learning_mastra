"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronRight, RefreshCw, CheckCircle, XCircle, Clock, PlayCircle, PauseCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NetworkTask {
  task_id: string;
  network_id: string;
  parent_job_id?: string;
  network_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  task_type: string;
  task_description: string;
  task_parameters?: unknown;
  task_result?: unknown;
  progress: number;
  created_by: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

interface TaskSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  averageProgress: number;
}

const statusIcons = {
  queued: <Clock className="w-4 h-4" />,
  running: <PlayCircle className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
  paused: <PauseCircle className="w-4 h-4" />
};

const statusColors = {
  queued: "bg-gray-500",
  running: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  paused: "bg-yellow-500"
};

// 優先度表示は小タスクでは使用しない

export function TaskViewer({ networkId }: { networkId?: string }) {
  const [tasks, setTasks] = useState<NetworkTask[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const url = networkId 
        ? `/api/db-viewer/tasks?networkId=${networkId}`
        : '/api/db-viewer/tasks';
        
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTasks(data.tasks);
        setSummary(data.summary);
      } else {
        throw new Error(data.error || 'Failed to fetch tasks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    if (autoRefresh) {
      const interval = setInterval(fetchTasks, 5000); // 5秒ごとに更新
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId, autoRefresh]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
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
      return `${hours}時間${minutes % 60}分`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  };

  if (loading && tasks.length === 0) {
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
            <Button onClick={fetchTasks} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              再試行
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card text-card-foreground">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>タスク管理</CardTitle>
            <CardDescription>
              {networkId ? `ネットワーク: ${networkId}` : 'すべてのタスク'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'bg-green-500/10' : ''}
            >
              {autoRefresh ? '自動更新ON' : '自動更新OFF'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchTasks}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-muted rounded-lg p-3">
              <div className="text-sm text-muted-foreground">合計</div>
              <div className="text-2xl font-bold">{summary.total}</div>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <div className="text-sm text-muted-foreground">待機中</div>
              <div className="text-2xl font-bold text-muted-foreground">{summary.queued}</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3">
              <div className="text-sm text-blue-600 dark:text-blue-400">実行中</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{summary.running}</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3">
              <div className="text-sm text-green-600 dark:text-green-400">完了</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.completed}</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3">
              <div className="text-sm text-red-600 dark:text-red-400">失敗</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.failed}</div>
            </div>
            <div className="bg-purple-500/10 rounded-lg p-3">
              <div className="text-sm text-purple-600 dark:text-purple-400">平均進捗</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{Math.round(summary.averageProgress)}%</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.task_id}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => toggleTaskExpansion(task.task_id)}
                      className="p-1 hover:bg-accent rounded transition-colors"
                    >
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${
                          expandedTasks.has(task.task_id) ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    
                    <div className={`w-2 h-2 rounded-full ${statusColors[task.status]}`} />
                    {statusIcons[task.status]}
                    
                    <span className="font-medium">{task.task_type}</span>
                    
                    {/* 小タスクでは優先度は表示しない */}
                    
                    {/* 小タスクでは担当者の表示は不要 */}
                  </div>
                  
                  <div className="ml-10">
                    <p className="text-sm text-muted-foreground mb-2 break-words">{task.task_description}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>作成: {formatDate(task.created_at)}</span>
                      <span>作成者: {task.created_by}</span>
                      {task.status === 'running' && (
                        <span>経過時間: {formatDuration(task.created_at)}</span>
                      )}
                      {task.completed_at && (
                        <span>完了: {formatDate(task.completed_at)}</span>
                      )}
                    </div>
                    
                    {task.progress > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{task.progress}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {expandedTasks.has(task.task_id) && (
                <div className="mt-4 ml-10 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium text-sm">タスクID:</span>
                      <span className="text-sm ml-2 font-mono">{task.task_id}</span>
                    </div>
                    
                    <div>
                      <span className="font-medium text-sm">ネットワークID:</span>
                      <span className="text-sm ml-2 font-mono">{task.network_id}</span>
                    </div>
                    
                    {task.parent_job_id && (
                      <div>
                        <span className="font-medium text-sm">親ジョブID:</span>
                        <span className="text-sm ml-2 font-mono">{task.parent_job_id}</span>
                      </div>
                    )}
                    
                    {typeof task.task_parameters !== 'undefined' && (
                      <div>
                        <span className="font-medium text-sm">パラメータ:</span>
                        <pre className="text-xs mt-1 p-2 bg-background rounded border overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(task.task_parameters, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {typeof task.task_result !== 'undefined' && (
                      <div>
                        <span className="font-medium text-sm">結果:</span>
                        <pre className="text-xs mt-1 p-2 bg-background rounded border overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                          {typeof task.task_result === 'string' ? task.task_result : JSON.stringify(task.task_result, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {task.metadata && Object.keys(task.metadata).length > 0 && (
                      <div>
                        <span className="font-medium text-sm">メタデータ:</span>
                        <pre className="text-xs mt-1 p-2 bg-background rounded border overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(task.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {tasks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            タスクがありません
          </div>
        )}
      </CardContent>
    </Card>
  );
}
