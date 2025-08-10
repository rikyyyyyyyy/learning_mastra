"use client";

import { useState, useEffect } from "react";
import { 
  Loader2, 
  ChevronRight, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  PlayCircle, 
  PauseCircle,
  Network,
  AlertCircle,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Activity,
  Timer
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  priority: 'low' | 'medium' | 'high';
  step_number?: number;
  depends_on?: string[];
  execution_time?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

interface NetworkGroup {
  networkId: string;
  tasks: NetworkTask[];
  totalProgress: number;
  status: 'idle' | 'active' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  taskCounts: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
}

const statusIcons = {
  queued: <Clock className="w-4 h-4" />,
  running: <PlayCircle className="w-4 h-4 animate-pulse" />,
  completed: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
  paused: <PauseCircle className="w-4 h-4" />
};

const statusColors = {
  queued: "text-gray-500",
  running: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
  paused: "text-yellow-500"
};

const priorityColors = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
};

export function NetworkTaskViewer() {
  const [networkGroups, setNetworkGroups] = useState<NetworkGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchTasks = async () => {
    try {
      setError(null);
      const response = await fetch('/api/db-viewer/tasks');
      
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // First, get all main network tasks to extract network info
        const mainNetworkTasks = data.tasks.filter((t: NetworkTask) => 
          t.created_by === 'general-agent' && !t.step_number
        );
        
        // Store network info from main tasks
        const networkInfo = new Map<string, { taskType: string, description: string }>();
        mainNetworkTasks.forEach((task: NetworkTask) => {
          networkInfo.set(task.network_id, {
            taskType: task.task_type,
            description: task.task_description
          });
        });
        
        // Group tasks by network ID
        const groups = groupTasksByNetwork(data.tasks, networkInfo);
        setNetworkGroups(groups);
      } else {
        throw new Error(data.error || 'Failed to fetch tasks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const groupTasksByNetwork = (
    tasks: NetworkTask[], 
    networkInfo?: Map<string, { taskType: string, description: string }>
  ): NetworkGroup[] => {
    const groupMap = new Map<string, NetworkTask[]>();
    
    // Group all tasks by network ID
    tasks.forEach(task => {
      const existing = groupMap.get(task.network_id) || [];
      existing.push(task);
      groupMap.set(task.network_id, existing);
    });
    
    // Convert to NetworkGroup array
    return Array.from(groupMap.entries()).map(([networkId, tasks]) => {
      // Sort tasks by step number, then by created_at
      const sortedTasks = tasks.sort((a, b) => {
        // First sort by step_number if both have it
        if (a.step_number !== undefined && b.step_number !== undefined) {
          return a.step_number - b.step_number;
        }
        // Tasks without step_number come first (main task)
        if (a.step_number === undefined && b.step_number !== undefined) return -1;
        if (a.step_number !== undefined && b.step_number === undefined) return 1;
        // Then sort by created_at
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      
      // Filter out main task (task without step_number) for statistics
      // Only count Manager-created tasks (those with step_number > 0)
      const subTasks = tasks.filter(t => t.step_number !== undefined && t.step_number > 0);
      
      // Calculate statistics (only for Manager-created sub-tasks)
      const taskCounts = {
        total: subTasks.length,
        queued: subTasks.filter(t => t.status === 'queued').length,
        running: subTasks.filter(t => t.status === 'running').length,
        completed: subTasks.filter(t => t.status === 'completed').length,
        failed: subTasks.filter(t => t.status === 'failed').length,
      };
      
      // Calculate total progress (only for sub-tasks)
      const totalProgress = subTasks.length > 0 
        ? subTasks.reduce((sum, t) => sum + t.progress, 0) / subTasks.length 
        : 0;
      
      // Determine network status
      let status: NetworkGroup['status'] = 'idle';
      if (taskCounts.running > 0) {
        status = 'active';
      } else if (taskCounts.failed > 0) {
        status = 'failed';
      } else if (taskCounts.completed === taskCounts.total && taskCounts.total > 0) {
        status = 'completed';
      }
      
      // Get start and end times
      const startTime = sortedTasks[0]?.created_at || new Date().toISOString();
      const endTime = sortedTasks.every(t => t.status === 'completed' || t.status === 'failed')
        ? sortedTasks[sortedTasks.length - 1]?.completed_at
        : undefined;
      
      return {
        networkId,
        tasks: sortedTasks,
        totalProgress,
        status,
        startTime,
        endTime,
        taskCounts,
      };
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  };

  useEffect(() => {
    fetchTasks();
    
    if (autoRefresh) {
      const interval = setInterval(fetchTasks, 3000); // 3秒ごとに更新
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const toggleNetworkExpansion = (networkId: string) => {
    setExpandedNetworks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(networkId)) {
        newSet.delete(networkId);
      } else {
        newSet.add(networkId);
      }
      return newSet;
    });
  };

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getNetworkStatusIcon = (status: NetworkGroup['status']) => {
    switch (status) {
      case 'active':
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading && networkGroups.length === 0) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Network className="w-6 h-6" />
          ネットワークタスク管理
        </h2>
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

      {networkGroups.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            ネットワークタスクがありません
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {networkGroups.map((group) => (
            <Card 
              key={group.networkId} 
              className={`border-l-4 ${
                group.status === 'active' ? 'border-l-blue-500' :
                group.status === 'completed' ? 'border-l-green-500' :
                group.status === 'failed' ? 'border-l-red-500' :
                'border-l-gray-500'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getNetworkStatusIcon(group.status)}
                      <span className="font-mono text-sm">
                        {(() => {
                          // Find the main network task created by general-agent
                          const mainTask = group.tasks.find(t => t.created_by === 'general-agent' && !t.step_number);
                          if (mainTask) {
                            // Show the main task's type and description
                            return `${mainTask.task_type.toUpperCase()} - ${mainTask.task_description.substring(0, 50)}${mainTask.task_description.length > 50 ? '...' : ''}`;
                          }
                          // Fallback to extracting from network ID
                          if (group.networkId.startsWith('agent-network-')) {
                            const taskType = group.networkId.replace('agent-network-', '').split('-')[0].toUpperCase();
                            return `${taskType} (${group.taskCounts.total} tasks)`;
                          }
                          return group.networkId;
                        })()}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="text-xs">
                        開始: {formatDate(group.startTime)} | 
                        経過時間: {formatDuration(group.startTime, group.endTime)}
                      </span>
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleNetworkExpansion(group.networkId)}
                  >
                    {expandedNetworks.has(group.networkId) ? 
                      <ChevronUp className="w-4 h-4" /> : 
                      <ChevronDown className="w-4 h-4" />
                    }
                  </Button>
                </div>
                
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex-1">
                    <Progress value={group.totalProgress} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      全体進捗: {Math.round(group.totalProgress)}%
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      合計: {group.taskCounts.total}
                    </Badge>
                    {group.taskCounts.running > 0 && (
                      <Badge className="bg-blue-500 text-xs">
                        実行中: {group.taskCounts.running}
                      </Badge>
                    )}
                    {group.taskCounts.completed > 0 && (
                      <Badge className="bg-green-500 text-xs">
                        完了: {group.taskCounts.completed}
                      </Badge>
                    )}
                    {group.taskCounts.failed > 0 && (
                      <Badge className="bg-red-500 text-xs">
                        失敗: {group.taskCounts.failed}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <Collapsible open={expandedNetworks.has(group.networkId)}>
                <CollapsibleContent>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-2">
                        {group.tasks
                          .filter(task => task.step_number !== undefined && task.step_number > 0 && task.created_by !== 'general-agent')
                          .map((task) => {
                          return (
                            <div
                              key={task.task_id}
                              className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {task.step_number && (
                                      <Badge variant="outline" className="text-xs">
                                        Step {task.step_number}
                                      </Badge>
                                    )}
                                    <span className={`flex items-center gap-1 ${statusColors[task.status]}`}>
                                      {statusIcons[task.status]}
                                      <span className="text-sm font-medium">
                                        {task.task_type}
                                      </span>
                                    </span>
                                    <Badge className={`text-xs ${priorityColors[task.priority]}`}>
                                      {task.priority}
                                    </Badge>
                                    {task.assigned_to && (
                                      <Badge variant="secondary" className="text-xs">
                                        {task.assigned_to}
                                      </Badge>
                                    )}
                                  </div>
                                
                                <p className="text-sm text-muted-foreground mb-1">
                                  {task.task_description}
                                </p>
                                
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>作成: {formatDate(task.created_at)}</span>
                                  {task.execution_time && (
                                    <span className="flex items-center gap-1">
                                      <Timer className="w-3 h-3" />
                                      {Math.round(task.execution_time / 1000)}秒
                                    </span>
                                  )}
                                </div>
                                
                                {task.progress > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <Progress value={task.progress} className="flex-1 h-1" />
                                    <span className="text-xs">{task.progress}%</span>
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleTaskExpansion(task.task_id)}
                              >
                                <ChevronRight 
                                  className={`w-4 h-4 transition-transform ${
                                    expandedTasks.has(task.task_id) ? 'rotate-90' : ''
                                  }`}
                                />
                              </Button>
                            </div>
                            
                              
                              {expandedTasks.has(task.task_id) && task.task_result && (
                                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                                  <div className="font-medium text-sm mb-2">タスク結果:</div>
                                  <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-48 overflow-y-auto">
                                    {typeof task.task_result === 'string' 
                                      ? task.task_result 
                                      : JSON.stringify(task.task_result, null, 2)}
                                  </pre>
                                  {task.depends_on && task.depends_on.length > 0 && (
                                    <div className="mt-2">
                                      <span className="font-medium text-sm">依存タスク:</span>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {task.depends_on.join(', ')}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}