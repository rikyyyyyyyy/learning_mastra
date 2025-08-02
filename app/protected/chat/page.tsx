"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, MessageSquarePlus, Eye, X, ChevronDown, FileText, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AgentConversation {
  agentId: string;
  agentName: string;
  message: string;
  timestamp: string;
  iteration: number;
  messageType?: 'request' | 'response' | 'internal';
  metadata?: {
    model?: string;
    tools?: string[];
    tokenCount?: number;
    executionTime?: number;
  };
}

interface AgentLogsData {
  jobId: string;
  taskType: string;
  conversationHistory: AgentConversation[];
  executionSummary: {
    totalIterations?: number;
    agentsInvolved?: string[];
    executionTime?: string;
  };
  completedAt?: Date;
}

interface JobData {
  jobId: string;
  taskType: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  agentLogs?: AgentLogsData;
  realtimeConversations: AgentConversation[];
  sseConnection?: EventSource;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

type AIModel = "claude-sonnet-4" | "openai-o3" | "gemini-2.5-flash";

interface ModelInfo {
  id: AIModel;
  name: string;
  provider: string;
  description: string;
}

const AI_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    description: "高度な推論と創造的なタスクに最適"
  },
  {
    id: "openai-o3",
    name: "OpenAI o3",
    provider: "OpenAI",
    description: "最新の高性能推論モデル"
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    description: "高速・低コストで思考機能搭載"
  }
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-1",
      role: "assistant",
      content: "こんにちは！私はAIアシスタントです。どんなことでもお聞きください。天気情報、タスクの管理、質問への回答など、様々なサポートができます。",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>("claude-sonnet-4");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showSlidePreview, setShowSlidePreview] = useState(false);
  const [currentSlidePreview, setCurrentSlidePreview] = useState<{
    jobId: string;
    htmlCode: string;
    slideInfo?: {
      topic?: string;
      slideCount?: number;
      style?: string;
    };
  } | null>(null);
  const [activeJobs, setActiveJobs] = useState<Map<string, JobData>>(new Map());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showAgentLogs, setShowAgentLogs] = useState(false);
  const [loadingAgentLogs, setLoadingAgentLogs] = useState(false);
  const [isRealTimeMode, setIsRealTimeMode] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdCounter = useRef(0);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const connectingJobs = useRef<Set<string>>(new Set());
  const [isComposing, setIsComposing] = useState(false);
  
  // threadIdを管理（セッション中は同じthreadIdを使用）
  const threadIdRef = useRef<string>(`thread-${Date.now()}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 現在選択されているジョブのデータを取得
  const selectedJob = selectedJobId ? activeJobs.get(selectedJobId) : null;

  // リアルタイムログストリーミングを開始する関数
  const startRealtimeLogStreaming = (jobId: string) => {
    console.log(`🔴 リアルタイムログストリーミング開始: ${jobId}`);
    
    // 既存のジョブデータを取得または新規作成
    const existingJob = activeJobs.get(jobId);
    
    // 既に接続されている場合はスキップ
    if (existingJob?.connectionStatus === 'connected' || existingJob?.connectionStatus === 'connecting') {
      console.log(`⚠️ 既にSSE接続が存在します: ${jobId}`);
      return;
    }
    
    // 接続中フラグをチェック
    if (connectingJobs.current.has(jobId)) {
      console.log(`⚠️ 既に接続処理中です: ${jobId}`);
      return;
    }
    
    // 接続中フラグを設定
    connectingJobs.current.add(jobId);
    
    if (existingJob?.sseConnection) {
      existingJob.sseConnection.close();
    }
    
    // ジョブデータを更新
    setActiveJobs(prev => {
      const newMap = new Map(prev);
      newMap.set(jobId, {
        ...existingJob,
        jobId,
        taskType: existingJob?.taskType || 'unknown',
        status: existingJob?.status || 'running',
        startTime: existingJob?.startTime || new Date(),
        realtimeConversations: [],
        connectionStatus: 'connecting'
      });
      return newMap;
    });
    
    // リトライ機能付きSSE接続
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒
    
    const connectSSE = () => {
      const eventSource = new EventSource(`/api/agent-logs/stream/${jobId}`);
      
      eventSource.onopen = () => {
        console.log('✅ SSE接続確立');
        // 接続中フラグを削除
        connectingJobs.current.delete(jobId);
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { ...job, connectionStatus: 'connected' });
          }
          return newMap;
        });
        retryCount = 0; // リセット
      };
      
      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('📡 接続確立:', data);
      });
      
      eventSource.addEventListener('history', (event) => {
        const data = JSON.parse(event.data);
        console.log('📜 履歴受信:', data.count, '件');
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { ...job, realtimeConversations: data.conversationHistory });
          }
          return newMap;
        });
      });
      
      eventSource.addEventListener('log-entry', (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 新規ログエントリ:', data.entry);
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { 
              ...job, 
              realtimeConversations: [...job.realtimeConversations, data.entry] 
            });
          }
          return newMap;
        });
      });
      
      eventSource.addEventListener('job-completed', (event) => {
        const data = JSON.parse(event.data);
        console.log('✅ ジョブ完了:', data);
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { 
              ...job, 
              status: 'completed',
              connectionStatus: 'disconnected',
              endTime: new Date()
            });
          }
          return newMap;
        });
      });
      
      eventSource.addEventListener('job-failed', (event) => {
        const data = JSON.parse(event.data);
        console.log('❌ ジョブ失敗:', data);
        setActiveJobs(prev => {
          const newMap = new Map(prev);
          const job = newMap.get(jobId);
          if (job) {
            newMap.set(jobId, { 
              ...job, 
              status: 'failed',
              connectionStatus: 'error',
              endTime: new Date()
            });
          }
          return newMap;
        });
      });
      
      eventSource.addEventListener('heartbeat', (event) => {
        console.log('💓 ハートビート受信');
      });
      
      eventSource.onerror = (error) => {
        console.error('❌ SSEエラー:', error);
        console.error('❌ SSE readyState:', eventSource.readyState);
        
        // EventSourceのreadyStateをチェック
        // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
        if (eventSource.readyState === 2) {
          eventSource.close();
          
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`🔄 SSE接続をリトライ中 (${retryCount}/${maxRetries})...`);
            setActiveJobs(prev => {
              const newMap = new Map(prev);
              const job = newMap.get(jobId);
              if (job) {
                newMap.set(jobId, { ...job, connectionStatus: 'connecting' });
              }
              return newMap;
            });
            
            // リトライ前にフラグを再設定
            connectingJobs.current.add(jobId);
            
            // 遅延してリトライ
            setTimeout(() => {
              connectSSE();
            }, retryDelay * retryCount);
          } else {
            console.error('❌ SSE接続の最大リトライ回数に達しました');
            // エラー時にフラグを削除
            connectingJobs.current.delete(jobId);
            setActiveJobs(prev => {
              const newMap = new Map(prev);
              const job = newMap.get(jobId);
              if (job) {
                newMap.set(jobId, { ...job, connectionStatus: 'error' });
              }
              return newMap;
            });
          }
        }
      };
      
      // SSE接続をジョブデータに保存
      setActiveJobs(prev => {
        const newMap = new Map(prev);
        const job = newMap.get(jobId);
        if (job) {
          newMap.set(jobId, { ...job, sseConnection: eventSource });
        }
        return newMap;
      });
    };
    
    // 初回接続
    try {
      connectSSE();
    } finally {
      // 接続処理が完了したらフラグを削除
      setTimeout(() => {
        connectingJobs.current.delete(jobId);
      }, 1000);
    }
  };
  
  // コンポーネントのクリーンアップ時にすべてのSSE接続を閉じる
  useEffect(() => {
    return () => {
      activeJobs.forEach(job => {
        if (job.sseConnection) {
          job.sseConnection.close();
        }
      });
    };
  }, []);
  
  // 古い完了済みジョブを定期的にクリーンアップ（最大20件まで保持）
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveJobs(prev => {
        if (prev.size <= 20) return prev;
        
        const newMap = new Map(prev);
        const sortedJobs = Array.from(prev.entries())
          .sort((a, b) => b[1].startTime.getTime() - a[1].startTime.getTime());
        
        // 古い完了済みジョブを削除
        const jobsToRemove = sortedJobs
          .filter(([_, job]) => job.status !== 'running')
          .slice(20);
        
        jobsToRemove.forEach(([jobId, job]) => {
          if (job.sseConnection) {
            job.sseConnection.close();
          }
          newMap.delete(jobId);
        });
        
        return newMap;
      });
    }, 60000); // 1分ごとにチェック
    
    return () => clearInterval(interval);
  }, []);
  
  // リアルタイムモードで会話が追加されたら自動スクロール
  useEffect(() => {
    if (isRealTimeMode && selectedJob && selectedJob.realtimeConversations.length > 0) {
      logScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedJob?.realtimeConversations, isRealTimeMode]);

  // エージェントログを取得する関数
  const fetchAgentLogs = async (jobId: string) => {
    setLoadingAgentLogs(true);
    try {
      console.log(`📥 エージェントログを取得中: ${jobId}`);
      
      const response = await fetch(`/api/agent-logs/${jobId}`);
      console.log('📡 API応答ステータス:', response.status);
      
      if (!response.ok) {
        console.error('❌ エージェントログの取得に失敗しました:', response.status);
        const errorText = await response.text();
        console.error('❌ エラー詳細:', errorText);
        return;
      }
      
      const logsData = await response.json() as AgentLogsData;
      console.log('📦 取得したエージェントログ:', logsData);
      
      // ジョブデータを更新
      setActiveJobs(prev => {
        const newMap = new Map(prev);
        const job = newMap.get(jobId);
        if (job) {
          newMap.set(jobId, { ...job, agentLogs: logsData });
        }
        return newMap;
      });
    } catch (error) {
      console.error('❌ エージェントログの取得エラー:', error);
    } finally {
      setLoadingAgentLogs(false);
    }
  };

  // スライドプレビューを表示する関数
  const showSlidePreviewModal = (previewData: {
    jobId: string;
    htmlCode: string;
    slideInfo?: {
      topic?: string;
      slideCount?: number;
      style?: string;
    };
  }) => {
    setCurrentSlidePreview(previewData);
    setShowSlidePreview(true);
  };

  // スライドプレビューを閉じる関数
  const closeSlidePreview = () => {
    setShowSlidePreview(false);
    setCurrentSlidePreview(null);
  };

  // ジョブIDからスライドプレビューを表示する関数
  const showSlidePreviewFromJobId = async (jobId: string) => {
    try {
      console.log(`📥 ジョブ結果を取得中: ${jobId}`);
      
      // ジョブ結果を取得するAPIエンドポイントを呼び出す
      const response = await fetch(`/api/job-result/${jobId}`);
      console.log('📡 API応答ステータス:', response.status);
      
      if (!response.ok) {
        console.error('❌ ジョブ結果の取得に失敗しました:', response.status);
        const errorText = await response.text();
        console.error('❌ エラー詳細:', errorText);
        return;
      }
      
      const jobResult = await response.json();
      console.log('📦 取得したジョブ結果:', jobResult);
      
      if (jobResult.htmlCode) {
        const previewData = {
          jobId,
          htmlCode: jobResult.htmlCode,
          slideInfo: {
            topic: jobResult.topic || 'Generated Slide',
            slideCount: jobResult.slideCount || 5,
            style: jobResult.style || 'modern'
          }
        };
        
        console.log('🖼️ スライドプレビューを表示:', previewData);
        showSlidePreviewModal(previewData);
      } else {
        console.error('❌ HTMLコードが見つかりません');
        console.error('❌ ジョブ結果の内容:', jobResult);
      }
    } catch (error) {
      console.error('❌ ジョブ結果の取得エラー:', error);
    }
  };

  // 新しい会話を開始する関数
  const startNewConversation = () => {
    // 新しいthreadIdを生成
    threadIdRef.current = `thread-${Date.now()}`;
    
    // メッセージをリセット
    setMessages([
      {
        id: "initial-new-" + Date.now(),
        role: "assistant",
        content: "新しい会話を開始しました。どんなことでもお聞きください！",
        timestamp: new Date(),
      },
    ]);
    
    // カウンターをリセット
    messageIdCounter.current = 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Generate unique IDs using counter
    messageIdCounter.current += 1;
    const userMessageId = `user-${messageIdCounter.current}`;
    
    const inputValue = input.trim();
    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setInput("");
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add empty assistant message that will be populated by streaming
    messageIdCounter.current += 1;
    const assistantMessageId = `assistant-${messageIdCounter.current}`;
    
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    
    // ユーザーがメッセージを送信した時のみスクロール
    setTimeout(() => {
      scrollToBottom();
    }, 100); // DOMの更新を待つため少し遅延

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputValue,
          threadId: threadIdRef.current, // threadIdを送信
          model: selectedModel, // 選択されたモデルを送信
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", response.status, errorText);
        
        if (response.status === 401) {
          throw new Error("認証エラーです。ページをリロードしてログインし直してください。");
        } else {
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error("No reader available");
      }

      let accumulatedContent = "";
      let slidePreviewJobId: string | null = null;
      let executedTools: string[] = [];

      // ストリーミングデータのバッファ
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // 改行で分割して処理
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 最後の不完全な行をバッファに残す
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            console.log('📨 受信データ:', line);
            const event = JSON.parse(line);
            console.log('📊 パースされたイベント:', event);
            
            switch (event.type) {
              case 'text':
                accumulatedContent += event.content;
                // Update the assistant message with accumulated content
                setMessages((prev) => 
                  prev.map((msg) => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
                break;
                
              case 'tool-execution':
                console.log(`🔧 ツール実行検出: ${event.toolName}`);
                executedTools.push(event.toolName);
                
                // agent-network-executorツールの実行を検出（ログのみ）
                if (event.toolName === 'agent-network-executor' || event.toolName === 'agentNetworkTool') {
                  console.log(`🤖 エージェントネットワークツール実行検出 (${event.toolName})`);
                  console.log(`🤖 引数:`, event.args);
                }
                break;
                
              case 'slide-preview-ready':
                console.log(`🎨 スライドプレビュー準備完了: ${event.jobId}`);
                slidePreviewJobId = event.jobId;
                break;
                
              case 'agent-network-job':
                console.log(`🤖 エージェントネットワークジョブ検出: ${event.jobId}`);
                console.log(`🤖 タスクタイプ: ${event.taskType}`);
                
                // ジョブデータを作成（自動ポップアップはしない）
                console.log(`🔴 エージェントネットワークジョブ検出: ${event.jobId}`);
                setActiveJobs(prev => {
                  const newMap = new Map(prev);
                  newMap.set(event.jobId, {
                    jobId: event.jobId,
                    taskType: event.taskType || 'unknown',
                    status: 'running',
                    startTime: new Date(),
                    realtimeConversations: [],
                    connectionStatus: 'disconnected'
                  });
                  return newMap;
                });
                
                // モーダルが開いていてリアルタイムモードの場合、自動的にSSE接続を開始
                if (showAgentLogs && isRealTimeMode) {
                  console.log(`🔴 モーダルが開いているため、新しいジョブのSSE接続を自動開始: ${event.jobId}`);
                  // setTimeoutを使わずに直接実行
                  startRealtimeLogStreaming(event.jobId);
                }
                break;
                
              case 'message-complete':
                console.log('📝 メッセージ完了:', event);
                executedTools = event.executedTools || [];
                break;
                
              default:
                console.log('⚠️ 未知のイベントタイプ:', event.type);
            }
          } catch (e) {
            console.error('❌ JSONパースエラー:', e);
            console.error('❌ 問題のある行:', line);
          }
        }
      }
      
      // 残りのバッファを処理
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          console.log('📊 最後のイベント:', event);
          if (event.type === 'slide-preview-ready') {
            slidePreviewJobId = event.jobId;
          }
        } catch (e) {
          console.error('❌ 最後のバッファのパースエラー:', e);
        }
      }
      
      // スライドプレビューが準備できた場合、自動的に表示
      if (slidePreviewJobId) {
        console.log(`🚀 スライドプレビューを自動表示: ${slidePreviewJobId}`);
        // ジョブIDからHTMLを取得して表示
        await showSlidePreviewFromJobId(slidePreviewJobId);
      }
    } catch (error) {
      console.error("Error:", error);
      // Update the assistant message with error content
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === assistantMessageId 
            ? { ...msg, content: "申し訳ありません。エラーが発生しました。もう一度お試しください。" }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800 rounded-lg">
              <Bot className="w-6 h-6 text-purple-700 dark:text-purple-300" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              AI アシスタント
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* モデル選択ドロップダウン */}
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-700"
              >
                <span className="text-sm">
                  {AI_MODELS.find(m => m.id === selectedModel)?.name}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showModelDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                  {AI_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelDropdown(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {model.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {model.provider} - {model.description}
                          </div>
                        </div>
                        {selectedModel === model.id && (
                          <div className="w-2 h-2 bg-gradient-to-r from-purple-600 to-purple-700 rounded-full shadow-sm" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* エージェントログビューアーボタン */}
            <Dialog open={showAgentLogs} onOpenChange={(open) => {
              setShowAgentLogs(open);
              
              if (open && isRealTimeMode) {
                // モーダルを開いた時、すべての実行中ジョブのSSE接続を開始
                activeJobs.forEach((job, jobId) => {
                  if (job.status === 'running' && job.connectionStatus === 'disconnected' && !connectingJobs.current.has(jobId)) {
                    console.log(`🔴 モーダルオープン時にSSE接続を開始: ${jobId}`);
                    startRealtimeLogStreaming(jobId);
                  }
                });
              } else if (!open && isRealTimeMode) {
                // モーダルを閉じた時にリアルタイムモードのSSE接続を停止
                activeJobs.forEach(job => {
                  if (job.sseConnection) {
                    console.log(`🔌 モーダルクローズ時にSSE接続を停止`);
                    job.sseConnection.close();
                  }
                });
              }
            }}>
              <DialogTrigger asChild>
                <button
                  onClick={() => {
                      // 最初のジョブを選択、またはジョブがない場合はただモーダルを開く
                      const jobIds = Array.from(activeJobs.keys());
                      if (jobIds.length > 0) {
                        const firstJobId = jobIds[jobIds.length - 1]; // 最新のジョブ
                        setSelectedJobId(firstJobId);
                        
                        // リアルタイムモードの場合、すべての実行中ジョブのSSE接続を開始
                        if (isRealTimeMode) {
                          activeJobs.forEach((job, jobId) => {
                            if (job.status === 'running' && job.connectionStatus === 'disconnected' && !connectingJobs.current.has(jobId)) {
                              console.log(`🔴 実行中ジョブのSSE接続を開始: ${jobId}`);
                              startRealtimeLogStreaming(jobId);
                            }
                          });
                        } else {
                          fetchAgentLogs(firstJobId);
                        }
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 relative"
                  >
                    <FileText className="w-5 h-5" />
                    エージェントログ
                    {activeJobs.size > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
                        {activeJobs.size}
                      </span>
                  )}
                </button>
              </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden shadow-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        エージェント間の会話履歴 {activeJobs.size > 0 && `(${activeJobs.size} ジョブ)`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newMode = !isRealTimeMode;
                            setIsRealTimeMode(newMode);
                            
                            if (newMode) {
                              // リアルタイムモードに切り替えた時、すべての実行中ジョブのSSE接続を開始
                              activeJobs.forEach((job, jobId) => {
                                if (job.status === 'running' && job.connectionStatus === 'disconnected' && !connectingJobs.current.has(jobId)) {
                                  console.log(`🔴 リアルタイムモードON: SSE接続を開始 ${jobId}`);
                                  startRealtimeLogStreaming(jobId);
                                }
                              });
                            } else {
                              // 履歴モードに切り替えた時、すべてのSSE接続を停止
                              activeJobs.forEach(job => {
                                if (job.sseConnection) {
                                  console.log(`🔌 履歴モードON: SSE接続を停止`);
                                  job.sseConnection.close();
                                }
                              });
                            }
                          }}
                          className={`px-3 py-1 text-sm rounded-md transition-all duration-200 ${
                            isRealTimeMode 
                              ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 shadow-sm' 
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {isRealTimeMode ? '🔴 リアルタイム' : '📁 履歴'}
                        </button>
                        {selectedJob && isRealTimeMode && selectedJob.connectionStatus === 'connected' && (
                          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                            接続中
                          </span>
                        )}
                      </div>
                    </DialogTitle>
                    <DialogDescription>
                      {selectedJob ? (
                        isRealTimeMode 
                          ? `リアルタイムモード - 接続状態: ${selectedJob.connectionStatus} | タスク: ${selectedJob.taskType}`
                          : selectedJob.agentLogs 
                            ? `タスク: ${selectedJob.agentLogs.taskType} | 実行時間: ${selectedJob.agentLogs.executionSummary?.executionTime || 'N/A'}` 
                            : 'ログを読み込み中...'
                      ) : activeJobs.size === 0 ? 'ジョブがありません' : 'ジョブを選択してください'}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="flex mt-4 gap-4 max-h-[65vh]">
                    {/* ジョブリスト（左サイドバー） */}
                    {activeJobs.size > 0 && (
                      <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 pr-4 overflow-y-auto">
                        <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 px-1">アクティブなジョブ</h3>
                        <div className="space-y-2">
                          {Array.from(activeJobs.entries()).reverse().map(([jobId, job]) => (
                            <button
                              key={jobId}
                              onClick={() => {
                                setSelectedJobId(jobId);
                                // リアルタイムモード以外でログを取得
                                if (!isRealTimeMode && !job.agentLogs) {
                                  fetchAgentLogs(jobId);
                                }
                              }}
                              className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                                selectedJobId === jobId
                                  ? 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 border-blue-500 shadow-md transform scale-[1.02]'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md hover:transform hover:scale-[1.01]'
                              } border ${selectedJobId === jobId ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'} shadow-sm`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {job.taskType}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {job.startTime.toLocaleTimeString('ja-JP')}
                                  </p>
                                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">
                                    {jobId.substring(0, 8)}...
                                  </p>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                  {job.status === 'running' ? (
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                      <span className="text-xs text-green-600 dark:text-green-400">実行中</span>
                                    </span>
                                  ) : job.status === 'completed' ? (
                                    <span className="text-xs text-blue-600 dark:text-blue-400">完了</span>
                                  ) : (
                                    <span className="text-xs text-red-600 dark:text-red-400">失敗</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* メインコンテンツ */}
                    <div className="flex-1 overflow-y-auto">
                      {loadingAgentLogs && !isRealTimeMode ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                        </div>
                      ) : selectedJob ? (
                        <div className="space-y-4">
                          {/* リアルタイムモードまたは履歴モードの会話を表示 */}
                          {(isRealTimeMode ? selectedJob.realtimeConversations : selectedJob.agentLogs?.conversationHistory || []).map((entry, index) => (
                          <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors duration-200">
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shadow-md ${
                                entry.agentId === 'ceo' ? 'bg-gradient-to-br from-purple-600 to-purple-700' :
                                entry.agentId === 'manager' ? 'bg-gradient-to-br from-blue-600 to-blue-700' :
                                'bg-gradient-to-br from-green-600 to-green-700'
                              }`}>
                                {entry.agentId === 'ceo' ? 'CEO' :
                                 entry.agentId === 'manager' ? 'MGR' :
                                 'WRK'}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <h4 className="font-semibold text-gray-900 dark:text-white">
                                    {entry.agentName}
                                  </h4>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                    イテレーション {entry.iteration}
                                  </span>
                                  {entry.messageType && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full shadow-sm ${
                                      entry.messageType === 'request' ? 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-700 dark:from-blue-900 dark:to-blue-800 dark:text-blue-300' :
                                      entry.messageType === 'response' ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-700 dark:from-green-900 dark:to-green-800 dark:text-green-300' :
                                      'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 dark:from-gray-700 dark:to-gray-600 dark:text-gray-300'
                                    }`}>
                                      {entry.messageType}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                  {entry.message}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(entry.timestamp).toLocaleTimeString('ja-JP')}
                                  </p>
                                  {entry.metadata?.model && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      モデル: {entry.metadata.model}
                                    </span>
                                  )}
                                  {entry.metadata?.tools && entry.metadata.tools.length > 0 && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      ツール: {entry.metadata.tools.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                          
                          {/* データがない場合の表示 */}
                          {((isRealTimeMode && selectedJob.realtimeConversations.length === 0) || 
                            (!isRealTimeMode && (!selectedJob.agentLogs?.conversationHistory || selectedJob.agentLogs.conversationHistory.length === 0))) && (
                            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                              {isRealTimeMode ? 'リアルタイムログを待機中...' : '会話履歴がありません'}
                            </p>
                          )}
                          
                          {/* 自動スクロール用の参照 */}
                          <div ref={logScrollRef} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                          {activeJobs.size === 0 ? 'アクティブなジョブがありません' : '左からジョブを選択してください'}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            
            <button
              onClick={startNewConversation}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <MessageSquarePlus className="w-5 h-5" />
              新しい会話
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-8 px-6 md:px-12 lg:px-16">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-6 flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md ${
                  message.role === "user"
                    ? "bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600"
                    : "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800"
                }`}
              >
                {message.role === "user" ? (
                  <User className="w-5 h-5 text-white" />
                ) : (
                  <Bot className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                )}
              </div>
              <div
                className={`flex-1 ${
                  message.role === "user" ? "text-right" : ""
                }`}
              >
                <div
                  className={`inline-block px-5 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-500 dark:to-purple-600 text-white shadow-purple-500/20"
                      : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-gray-500/10 hover:shadow-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {message.content}
                    {message.role === "assistant" && message.content === "" && isLoading && (
                      <span className="inline-flex items-center space-x-1">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {message.timestamp.toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="bg-white dark:bg-gray-800 px-5 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 md:px-12 lg:px-16 py-4 shadow-lg">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="メッセージを入力してください..."
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all duration-200 shadow-sm focus:shadow-md"
              rows={1}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-300 disabled:to-gray-300 dark:disabled:from-gray-600 dark:disabled:to-gray-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:transform-none disabled:shadow-none"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      {/* スライドプレビューモーダル */}
      {showSlidePreview && currentSlidePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    スライドプレビュー
                  </h2>
                  {currentSlidePreview.slideInfo && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {currentSlidePreview.slideInfo.topic} - {currentSlidePreview.slideInfo.slideCount}枚 ({currentSlidePreview.slideInfo.style})
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={closeSlidePreview}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 hover:shadow-md"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            
            {/* スライドコンテンツ */}
            <div className="flex-1 p-4">
              <iframe
                srcDoc={currentSlidePreview.htmlCode}
                className="w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg shadow-inner"
                title="スライドプレビュー"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            
            {/* モーダルフッター */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Job ID: {currentSlidePreview.jobId}
                </div>
                <button
                  onClick={closeSlidePreview}
                  className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}