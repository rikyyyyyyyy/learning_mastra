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
  const [recentAgentNetworkJobs, setRecentAgentNetworkJobs] = useState<string[]>([]);
  const [showAgentLogs, setShowAgentLogs] = useState(false);
  const [currentAgentLogs, setCurrentAgentLogs] = useState<AgentLogsData | null>(null);
  const [loadingAgentLogs, setLoadingAgentLogs] = useState(false);
  const [isRealTimeMode, setIsRealTimeMode] = useState(true);
  const [realtimeConversations, setRealtimeConversations] = useState<AgentConversation[]>([]);
  const [sseConnection, setSseConnection] = useState<EventSource | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdCounter = useRef(0);
  const logScrollRef = useRef<HTMLDivElement>(null);
  
  // threadIdを管理（セッション中は同じthreadIdを使用）
  const threadIdRef = useRef<string>(`thread-${Date.now()}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // リアルタイムログストリーミングを開始する関数
  const startRealtimeLogStreaming = (jobId: string) => {
    // 既存の接続があれば閉じる
    if (sseConnection) {
      sseConnection.close();
    }
    
    console.log(`🔴 リアルタイムログストリーミング開始: ${jobId}`);
    setConnectionStatus('connecting');
    setRealtimeConversations([]);
    
    // リトライ機能付きSSE接続
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒
    
    const connectSSE = () => {
      const eventSource = new EventSource(`/api/agent-logs/stream/${jobId}`);
      
      eventSource.onopen = () => {
        console.log('✅ SSE接続確立');
        setConnectionStatus('connected');
        retryCount = 0; // リセット
      };
      
      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('📡 接続確立:', data);
      });
      
      eventSource.addEventListener('history', (event) => {
        const data = JSON.parse(event.data);
        console.log('📜 履歴受信:', data.count, '件');
        setRealtimeConversations(data.conversationHistory);
      });
      
      eventSource.addEventListener('log-entry', (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 新規ログエントリ:', data.entry);
        setRealtimeConversations(prev => [...prev, data.entry]);
      });
      
      eventSource.addEventListener('job-completed', (event) => {
        const data = JSON.parse(event.data);
        console.log('✅ ジョブ完了:', data);
        setConnectionStatus('disconnected');
      });
      
      eventSource.addEventListener('job-failed', (event) => {
        const data = JSON.parse(event.data);
        console.log('❌ ジョブ失敗:', data);
        setConnectionStatus('error');
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
            setConnectionStatus('connecting');
            
            // 遅延してリトライ
            setTimeout(() => {
              connectSSE();
            }, retryDelay * retryCount);
          } else {
            console.error('❌ SSE接続の最大リトライ回数に達しました');
            setConnectionStatus('error');
          }
        }
      };
      
      setSseConnection(eventSource);
    };
    
    // 初回接続
    connectSSE();
  };
  
  // SSE接続をクリーンアップ
  useEffect(() => {
    return () => {
      if (sseConnection) {
        sseConnection.close();
      }
    };
  }, [sseConnection]);
  
  // リアルタイムモードで会話が追加されたら自動スクロール
  useEffect(() => {
    if (isRealTimeMode && realtimeConversations.length > 0) {
      logScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [realtimeConversations, isRealTimeMode]);

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
      
      setCurrentAgentLogs(logsData);
      setShowAgentLogs(true);
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
                // 最近のエージェントネットワークジョブリストに追加
                setRecentAgentNetworkJobs(prev => {
                  console.log(`📝 現在のジョブリスト:`, prev);
                  const updated = [event.jobId, ...prev.filter(id => id !== event.jobId)];
                  console.log(`📝 更新後のジョブリスト:`, updated);
                  return updated.slice(0, 10); // 最新10件まで保持
                });
                
                // リアルタイムモードの場合、自動的にモーダルを開いてSSE接続を開始
                if (isRealTimeMode) {
                  console.log(`🔴 エージェントネットワークジョブ検出 - モーダルを開いてSSE接続を開始`);
                  // ジョブが作成されるまで少し待つ
                  setTimeout(() => {
                    setShowAgentLogs(true); // モーダルを開く
                    startRealtimeLogStreaming(event.jobId);
                  }, 500);
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
        
        // Scroll to bottom during streaming
        scrollToBottom();
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              AI アシスタント
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* モデル選択ドロップダウン */}
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                <span className="text-sm">
                  {AI_MODELS.find(m => m.id === selectedModel)?.name}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showModelDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-10">
                  {AI_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelDropdown(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                          <div className="w-2 h-2 bg-purple-600 rounded-full" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* エージェントログビューアーボタン */}
            {(() => {
              console.log(`🎯 レンダリング時のジョブリスト:`, recentAgentNetworkJobs);
              console.log(`🎯 ジョブリストの長さ:`, recentAgentNetworkJobs.length);
              return null;
            })()}
            {recentAgentNetworkJobs.length > 0 && (
              <Dialog open={showAgentLogs} onOpenChange={setShowAgentLogs}>
                <DialogTrigger asChild>
                  <button
                    onClick={() => {
                      if (recentAgentNetworkJobs.length > 0) {
                        const jobId = recentAgentNetworkJobs[0];
                        if (isRealTimeMode) {
                          startRealtimeLogStreaming(jobId);
                        } else {
                          fetchAgentLogs(jobId);
                        }
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <FileText className="w-5 h-5" />
                    エージェントログ
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        エージェント間の会話履歴
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsRealTimeMode(!isRealTimeMode)}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            isRealTimeMode 
                              ? 'bg-green-600 text-white hover:bg-green-700' 
                              : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-500'
                          }`}
                        >
                          {isRealTimeMode ? '🔴 リアルタイム' : '📁 履歴'}
                        </button>
                        {isRealTimeMode && connectionStatus === 'connected' && (
                          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                            接続中
                          </span>
                        )}
                      </div>
                    </DialogTitle>
                    <DialogDescription>
                      {isRealTimeMode 
                        ? `リアルタイムモード - 接続状態: ${connectionStatus}`
                        : currentAgentLogs 
                          ? `タスク: ${currentAgentLogs.taskType} | 実行時間: ${currentAgentLogs.executionSummary?.executionTime || 'N/A'}` 
                          : 'ログを読み込み中...'}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="mt-4 overflow-y-auto max-h-[60vh]">
                    {loadingAgentLogs && !isRealTimeMode ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* リアルタイムモードまたは履歴モードの会話を表示 */}
                        {(isRealTimeMode ? realtimeConversations : currentAgentLogs?.conversationHistory || []).map((entry, index) => (
                          <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                                entry.agentId === 'ceo' ? 'bg-purple-600' :
                                entry.agentId === 'manager' ? 'bg-blue-600' :
                                'bg-green-600'
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
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    イテレーション {entry.iteration}
                                  </span>
                                  {entry.messageType && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      entry.messageType === 'request' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                      entry.messageType === 'response' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
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
                        {((isRealTimeMode && realtimeConversations.length === 0) || 
                          (!isRealTimeMode && (!currentAgentLogs?.conversationHistory || currentAgentLogs.conversationHistory.length === 0))) && (
                          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                            {isRealTimeMode ? 'リアルタイムログを待機中...' : '会話履歴がありません'}
                          </p>
                        )}
                        
                        {/* 自動スクロール用の参照 */}
                        <div ref={logScrollRef} />
                      </div>
                    )}
                  </div>
                  
                  {/* ジョブ選択ドロップダウン */}
                  {recentAgentNetworkJobs.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <label className="text-sm text-gray-600 dark:text-gray-400">
                        他のジョブを表示:
                      </label>
                      <select
                        className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        onChange={(e) => {
                          const selectedJobId = e.target.value;
                          if (isRealTimeMode) {
                            startRealtimeLogStreaming(selectedJobId);
                          } else {
                            fetchAgentLogs(selectedJobId);
                          }
                        }}
                        value={currentAgentLogs?.jobId || recentAgentNetworkJobs[0] || ''}
                      >
                        {recentAgentNetworkJobs.map((jobId) => (
                          <option key={jobId} value={jobId}>
                            {jobId}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
            
            <button
              onClick={startNewConversation}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <MessageSquarePlus className="w-5 h-5" />
              新しい会話
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 px-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-6 flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === "user"
                    ? "bg-purple-600 dark:bg-purple-500"
                    : "bg-gray-200 dark:bg-gray-700"
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
                  className={`inline-block px-4 py-2 rounded-2xl ${
                    message.role === "user"
                      ? "bg-purple-600 dark:bg-purple-500 text-white"
                      : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
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
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <Bot className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="メッセージを入力してください..."
              className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
              rows={1}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      {/* スライドプレビューモーダル */}
      {showSlidePreview && currentSlidePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
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
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            
            {/* スライドコンテンツ */}
            <div className="flex-1 p-4">
              <iframe
                srcDoc={currentSlidePreview.htmlCode}
                className="w-full h-full border border-gray-200 dark:border-gray-700 rounded-lg"
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
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
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