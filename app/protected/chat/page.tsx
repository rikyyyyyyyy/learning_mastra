"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, MessageSquarePlus, Eye, X, ChevronDown, FileText, MessageCircle, Database } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DBViewerDialog } from "@/components/db-viewers/db-viewer-dialog";
import SlideBrowser from "@/components/slide/SlideBrowser";

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

type RegistryModel = { key: string; info: { displayName: string; provider: string; modelId: string; capabilities?: { reasoning?: boolean } } };

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
  const [models, setModels] = useState<RegistryModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-4");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  // Reasoning UI state
  const [reasoningEnabled, setReasoningEnabled] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<'low'|'medium'|'high'>('medium');
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
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
  const [showDBViewer, setShowDBViewer] = useState(false);
  
  // threadIdを管理（セッション中は同じthreadIdを使用）
  const threadIdRef = useRef<string>(`thread-${Date.now()}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 現在選択されているジョブのデータを取得
  const selectedJob = selectedJobId ? activeJobs.get(selectedJobId) : null;

  // モデル一覧を読み込み（単一情報源: /api/admin/models）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/models');
        const data: RegistryModel[] = await res.json();
        if (cancelled) return;
        setModels(data);
        // 既存の選択が一覧に無ければ先頭に切替
        const exists = data.some(m => m.key === selectedModel);
        if (!exists) {
          const fallback = data[0]?.key || 'claude-sonnet-4';
          setSelectedModel(fallback);
        }
      } catch (e) {
        console.error('モデル一覧の取得に失敗:', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      
      eventSource.addEventListener('heartbeat', () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          .filter(([, job]) => job.status !== 'running')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCurrentSlideIndex(0); // スライドインデックスをリセット
    // スライド数を初期化（後でiframeロード後に更新）
    setTotalSlides(previewData.slideInfo?.slideCount || 5);
  };

  // スライドプレビューを閉じる関数
  const closeSlidePreview = () => {
    setShowSlidePreview(false);
    setCurrentSlidePreview(null);
    setCurrentSlideIndex(0);
    setTotalSlides(0);
  };

  // プレビュー領域にスライド内容をフィット（iframe内部をスケール）
  const fitSlideIframe = () => {
    const iframeEl = iframeRef.current as HTMLIFrameElement | null;
    const parent = iframeEl?.parentElement as HTMLElement | null;
    const doc = iframeEl?.contentDocument as Document | null;
    if (!iframeEl || !parent || !doc) return;
    const html = doc.documentElement as HTMLElement;
    const body = doc.body as HTMLElement;

    // 100%レイアウトで中央寄せ
    html.style.width = '100%';
    html.style.height = '100%';
    html.style.margin = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.style.position = 'relative';

    // ラッパー生成（初回のみ）
    let wrapper = doc.getElementById('slide-fit-wrapper') as HTMLElement | null;
    if (!wrapper) {
      wrapper = doc.createElement('div');
      wrapper.id = 'slide-fit-wrapper';
      // 既存の子要素をすべて wrapper に移動
      while (body.firstChild) wrapper.appendChild(body.firstChild);
      body.appendChild(wrapper);
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.willChange = 'transform';
      wrapper.style.position = 'absolute';
      wrapper.style.top = '0';
      wrapper.style.left = '0';
      // 元の自然サイズを保存
      const naturalWidth = Math.max(wrapper.scrollWidth, wrapper.offsetWidth, 1);
      const naturalHeight = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 1);
      wrapper.dataset.naturalWidth = String(naturalWidth);
      wrapper.dataset.naturalHeight = String(naturalHeight);
      wrapper.style.width = naturalWidth + 'px';
      wrapper.style.height = naturalHeight + 'px';
    }

    const naturalWidth = Number(wrapper.dataset.naturalWidth || Math.max(wrapper.scrollWidth, wrapper.offsetWidth, 1));
    const naturalHeight = Number(wrapper.dataset.naturalHeight || Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 1));

    const availWidth = parent.clientWidth;
    const availHeight = parent.clientHeight;
    const scale = Math.min(availWidth / naturalWidth, availHeight / naturalHeight, 1);
    const offsetX = Math.max(0, (availWidth - naturalWidth * scale) / 2);
    const offsetY = Math.max(0, (availHeight - naturalHeight * scale) / 2);
    wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };

  // スライドナビゲーション関数
  const navigateSlide = (direction: 'prev' | 'next') => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    try {
      const iframeWindow = iframeRef.current.contentWindow;
      const iframeDocument = iframeRef.current.contentDocument;
      
      if (!iframeDocument) return;

      // iframe内のスライドを取得
      const slides = iframeDocument.querySelectorAll('.slide');
      if (slides.length === 0) return;

      // 総スライド数を更新
      if (slides.length !== totalSlides) {
        setTotalSlides(slides.length);
      }

      // 現在のスライドインデックスを計算
      let newIndex = currentSlideIndex;
      if (direction === 'next' && currentSlideIndex < slides.length - 1) {
        newIndex = currentSlideIndex + 1;
      } else if (direction === 'prev' && currentSlideIndex > 0) {
        newIndex = currentSlideIndex - 1;
      }

      // スライドを切り替え
      slides.forEach((slide, index) => {
        if (slide instanceof HTMLElement) {
          if (index === newIndex) {
            slide.classList.add('active');
            slide.style.display = 'block';
          } else {
            slide.classList.remove('active');
            slide.style.display = 'none';
          }
        }
      });

      setCurrentSlideIndex(newIndex);
      // スライドが変わったら再フィット
      fitSlideIframe();

      // iframe内にpreviousSlide/nextSlide関数があれば呼び出す
      interface SlideNavigationWindow extends Window {
        previousSlide?: () => void;
        nextSlide?: () => void;
      }
      const slideWindow = iframeWindow as SlideNavigationWindow;
      if (direction === 'prev' && typeof slideWindow.previousSlide === 'function') {
        slideWindow.previousSlide();
      } else if (direction === 'next' && typeof slideWindow.nextSlide === 'function') {
        slideWindow.nextSlide();
      }
    } catch (error) {
      console.error('スライドナビゲーションエラー:', error);
    }
  };

  // iframeロード完了時の処理
  const handleIframeLoad = () => {
    if (!iframeRef.current || !iframeRef.current.contentDocument) return;

    try {
      const iframeDocument = iframeRef.current.contentDocument;
      const slides = iframeDocument.querySelectorAll('.slide');
      
      if (slides.length > 0) {
        setTotalSlides(slides.length);
        
        // スライドのスタイルを確認し、必要に応じて修正
        const slideContainer = iframeDocument.querySelector('.slide-container') || iframeDocument.body;
        
        // コンテナのスタイルを設定
        if (slideContainer instanceof HTMLElement) {
          slideContainer.style.position = 'relative';
          slideContainer.style.width = '100%';
          slideContainer.style.height = '100%';
          slideContainer.style.overflow = 'hidden';
        }
        
        // まず、スライドが縦に並んでいるかチェック
        let needsFix = false;
        if (slides.length > 1) {
          const firstSlide = slides[0];
          const secondSlide = slides[1];
          if (firstSlide instanceof HTMLElement && secondSlide instanceof HTMLElement) {
            // 一時的に両方のスライドを表示して位置を確認
            const originalFirstDisplay = firstSlide.style.display;
            const originalSecondDisplay = secondSlide.style.display;
            firstSlide.style.display = 'block';
            secondSlide.style.display = 'block';
            
            const firstRect = firstSlide.getBoundingClientRect();
            const secondRect = secondSlide.getBoundingClientRect();
            
            // 2番目のスライドが1番目の下に表示されている場合
            if (secondRect.top > firstRect.bottom - 10) { // 10pxの余裕を持たせる
              needsFix = true;
              console.log('縦長スライドを検出。修正を適用します。');
            }
            
            // 元の表示状態に戻す
            firstSlide.style.display = originalFirstDisplay;
            secondSlide.style.display = originalSecondDisplay;
          }
        }
        
        // 修正が必要な場合、強制的なCSSを追加
        if (needsFix) {
          const style = iframeDocument.createElement('style');
          style.textContent = `
            body, html {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: 100% !important;
              overflow: hidden !important;
            }
            .slide-container, body {
              position: relative !important;
              width: 100% !important;
              height: 100% !important;
              overflow: hidden !important;
            }
            .slide {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              display: none !important;
              box-sizing: border-box !important;
              overflow: auto !important;
              margin: 0 !important;
            }
            .slide.active {
              display: block !important;
            }
          `;
          iframeDocument.head.appendChild(style);
        }
        
        // 各スライドのスタイルを設定
        slides.forEach((slide, index) => {
          if (slide instanceof HTMLElement) {
            if (needsFix) {
              // 強制的なスタイルを適用
              slide.style.position = 'absolute';
              slide.style.top = '0';
              slide.style.left = '0';
              slide.style.width = '100%';
              slide.style.height = '100%';
              slide.style.boxSizing = 'border-box';
              slide.style.margin = '0';
            }
            
            if (index === 0) {
              slide.classList.add('active');
              slide.style.display = 'block';
              slide.style.visibility = 'visible';
              slide.style.opacity = '1';
            } else {
              slide.classList.remove('active');
              slide.style.display = 'none';
              slide.style.visibility = 'hidden';
              slide.style.opacity = '0';
            }
          }
        });
      } else {
        console.warn('スライド要素が見つかりません。');
      }

      // キーボードイベントをiframeに追加
      iframeDocument.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
          navigateSlide('prev');
        } else if (e.key === 'ArrowRight') {
          navigateSlide('next');
        }
      });
      
      // 初回フィット + リサイズ監視（iframe内部をスケール）
      fitSlideIframe();
      const ro = new ResizeObserver(() => fitSlideIframe());
      if (iframeRef.current?.parentElement) ro.observe(iframeRef.current.parentElement);
      // コンテンツ側のサイズ変化にも追従
      const contentWrapper = iframeDocument.getElementById('slide-fit-wrapper');
      let roContent: ResizeObserver | null = null;
      if (contentWrapper) {
        roContent = new ResizeObserver(() => fitSlideIframe());
        roContent.observe(contentWrapper);
      }
      window.addEventListener('resize', fitSlideIframe);

      // Cleanup when component unmounts or iframe navigates away
      const cleanup = () => {
        ro.disconnect();
        roContent?.disconnect();
        window.removeEventListener('resize', fitSlideIframe);
      };
      // If the iframe document becomes hidden/unloaded, cleanup observers
      iframeDocument.addEventListener('visibilitychange', () => {
        if (iframeDocument.visibilityState === 'hidden') cleanup();
      });
    } catch (error) {
      console.error('iframeロードエラー:', error);
    }
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
          toolMode,
          modelOptions: (() => {
            const current = models.find(m => m.key === selectedModel);
            const supportsReasoning = !!current?.info.capabilities?.reasoning;
            if (!supportsReasoning || !reasoningEnabled) return undefined;
            return { reasoning: { effort: reasoningEffort } };
          })(),
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
                break;
                
              case 'slide-preview-ready':
                console.log(`🎨 スライドプレビュー準備完了: ${event.jobId}`);
                slidePreviewJobId = event.jobId;
                break;
                
              // ネットワークジョブイベントは廃止
              // case 'agent-network-job':
              //   break;
                
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
    <div className="flex h-screen bg-background">
      {/* Left side - Chat area */}
      <div className={`flex flex-col ${showSlidePreview ? 'w-1/2' : 'w-full'} transition-all duration-300`}>
        {/* Header */}
        <div className="bg-card/50 backdrop-blur-xl border-b px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-primary/10 rounded-2xl">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                AI アシスタント
              </h1>
            </div>
            {/* ツールモード切替は現在ワークフローのみのため非表示 */}
            {/* Reasoning 設定（対応モデルのみ表示） */}
            {(() => {
              const current = models.find(m => m.key === selectedModel);
              const supportsReasoning = !!current?.info.capabilities?.reasoning;
              if (!supportsReasoning) return null;
              return (
                <div className="relative">
                  <div className="flex items-center gap-2 px-2 py-2 bg-secondary text-foreground rounded-xl border">
                    <label className="text-sm">Reasoning</label>
                    <input type="checkbox" className="accent-primary" checked={reasoningEnabled} onChange={(e) => setReasoningEnabled(e.target.checked)} />
                    <select
                      className="bg-transparent outline-none text-sm disabled:opacity-50"
                      value={reasoningEffort}
                      onChange={(e) => setReasoningEffort(e.target.value as 'low'|'medium'|'high')}
                      disabled={!reasoningEnabled}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              );
            })()}
            <div className="flex items-center gap-3">
            {/* モデル選択ドロップダウン */}
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-all duration-200 shadow-sm hover:shadow border"
              >
                <span className="text-sm">
                  {models.find(m => m.key === selectedModel)?.info.displayName || selectedModel}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showModelDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border py-2 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                  {models.map((model) => (
                    <button
                      key={model.key}
                      onClick={() => {
                        setSelectedModel(model.key);
                        setShowModelDropdown(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-accent transition-all duration-200 group rounded-lg mx-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-foreground">
                            {model.info.displayName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {model.info.provider} - {model.info.modelId}
                          </div>
                        </div>
                        {selectedModel === model.key && (
                          <div className="w-2 h-2 bg-primary rounded-full" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* スライドブラウザボタン（モデル選択の横） */}
            <SlideBrowser />
            
            {/* DBビューアボタン */}
            <button
              onClick={() => setShowDBViewer(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl transition-all duration-200 shadow-sm hover:shadow border"
              title="データベースビューア"
            >
              <Database className="w-4 h-4" />
              <span className="text-sm">DB</span>
            </button>
            
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
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] relative"
                  >
                    <FileText className="w-5 h-5" />
                    エージェントログ
                    {activeJobs.size > 0 && (
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
                        {activeJobs.size}
                      </span>
                  )}
                </button>
              </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
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
                          className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                            isRealTimeMode 
                              ? 'bg-primary text-primary-foreground shadow-sm hover:shadow' 
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
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
                      <div className="w-64 flex-shrink-0 border-r pr-4 overflow-y-auto">
                        <h3 className="font-semibold text-sm text-muted-foreground mb-3 px-1">アクティブなジョブ</h3>
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
                              className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                                selectedJobId === jobId
                                  ? 'bg-accent border-accent-foreground/20 shadow-md'
                                  : 'bg-card hover:bg-accent hover:shadow border'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {job.taskType}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {job.startTime.toLocaleTimeString('ja-JP')}
                                  </p>
                                  <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">
                                    {jobId.substring(0, 8)}...
                                  </p>
                                </div>
                                <div className="flex-shrink-0 ml-2">
                                  {job.status === 'running' ? (
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                      <span className="text-xs text-green-600 dark:text-green-500">実行中</span>
                                    </span>
                                  ) : job.status === 'completed' ? (
                                    <span className="text-xs text-blue-600 dark:text-blue-500">完了</span>
                                  ) : (
                                    <span className="text-xs text-destructive">失敗</span>
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
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : selectedJob ? (
                        <div className="space-y-4">
                          {/* リアルタイムモードまたは履歴モードの会話を表示 */}
                          {(isRealTimeMode ? selectedJob.realtimeConversations : selectedJob.agentLogs?.conversationHistory || []).map((entry, index) => (
                          <div key={index} className="border-l-2 border-muted pl-4 hover:border-muted-foreground/50 transition-colors duration-200">
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-semibold shadow-sm ${
                                entry.agentId === 'ceo' ? 'bg-primary text-primary-foreground' :
                                entry.agentId === 'manager' ? 'bg-secondary text-secondary-foreground' :
                                'bg-accent text-accent-foreground'
                              }`}>
                                {entry.agentId === 'ceo' ? 'CEO' :
                                 entry.agentId === 'manager' ? 'MGR' :
                                 'WRK'}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <h4 className="font-semibold text-foreground">
                                    {entry.agentName}
                                  </h4>
                                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">
                                    イテレーション {entry.iteration}
                                  </span>
                                  {entry.messageType && (
                                    <span className={`text-xs px-2 py-0.5 rounded-lg ${
                                      entry.messageType === 'request' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                                      entry.messageType === 'response' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                                      'bg-muted text-muted-foreground'
                                    }`}>
                                      {entry.messageType}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                                  {entry.message}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(entry.timestamp).toLocaleTimeString('ja-JP')}
                                  </p>
                                  {entry.metadata?.model && (
                                    <span className="text-xs text-muted-foreground">
                                      モデル: {entry.metadata.model}
                                    </span>
                                  )}
                                  {entry.metadata?.tools && entry.metadata.tools.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
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
                            <p className="text-center text-muted-foreground py-8">
                              {isRealTimeMode ? 'リアルタイムログを待機中...' : '会話履歴がありません'}
                            </p>
                          )}
                          
                          {/* 自動スクロール用の参照 */}
                          <div ref={logScrollRef} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          {activeJobs.size === 0 ? 'アクティブなジョブがありません' : '左からジョブを選択してください'}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            
            <button
              onClick={startNewConversation}
              className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl transition-all duration-200 shadow-sm hover:shadow active:scale-[0.98]"
            >
              <MessageSquarePlus className="w-5 h-5" />
              新しい会話
            </button>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto">
        <div className={`py-8 px-6 ${showSlidePreview ? 'md:px-8 lg:px-12' : 'md:px-12 lg:px-20'} max-w-4xl mx-auto`}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-6 flex gap-4 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary"
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
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border hover:shadow"
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
                <div className={`flex items-center gap-2 mt-1 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}>
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
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center shadow-sm">
                <Bot className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="bg-card px-5 py-3 rounded-2xl border shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-card/50 backdrop-blur-xl border-t px-6 py-5">
        <form onSubmit={handleSubmit} className={`${showSlidePreview ? 'md:px-8 lg:px-12' : 'md:px-12 lg:px-20'} max-w-4xl mx-auto`}>
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="メッセージを入力してください..."
              className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200 shadow-sm focus:shadow"
              rows={1}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-5 py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-xl transition-all duration-200 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-[0.98] disabled:active:scale-100"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* Right side - Slide Preview Panel */}
    {showSlidePreview && currentSlidePreview && (
      <div className="w-1/2 border-l flex flex-col bg-card animate-in slide-in-from-right duration-300">
        {/* Preview Header */}
        <div className="bg-card/50 backdrop-blur-xl border-b px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  スライドプレビュー
                </h2>
                {currentSlidePreview.slideInfo && (
                  <p className="text-sm text-muted-foreground">
                    {currentSlidePreview.slideInfo.topic} - {currentSlidePreview.slideInfo.slideCount}枚
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={closeSlidePreview}
              className="p-2 hover:bg-accent rounded-xl transition-all duration-200"
              title="プレビューを閉じる"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
        
        {/* Slide Content */}
        <div className="flex-1 p-4 overflow-hidden relative">
          <div className="w-full h-full bg-white dark:bg-gray-900 rounded-xl shadow-inner overflow-hidden">
            <iframe
              ref={iframeRef}
              srcDoc={currentSlidePreview.htmlCode}
              className="w-full h-full"
              title="スライドプレビュー"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              style={{ border: 'none' }}
              onLoad={handleIframeLoad}
            />
          </div>
          
          {/* Navigation Controls */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-card/95 backdrop-blur-sm rounded-full shadow-lg px-6 py-3">
            <button
              onClick={() => navigateSlide('prev')}
              disabled={currentSlideIndex === 0}
              className="p-2 hover:bg-accent rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="前のスライド"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-primary">{currentSlideIndex + 1}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{totalSlides}</span>
            </div>
            
            <button
              onClick={() => navigateSlide('next')}
              disabled={currentSlideIndex === totalSlides - 1}
              className="p-2 hover:bg-accent rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="次のスライド"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Preview Footer */}
        <div className="border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground font-mono">
              Job ID: {currentSlidePreview.jobId.substring(0, 16)}...
            </div>
            <div className="text-xs text-muted-foreground">
              {currentSlidePreview.slideInfo?.style || 'modern'} スタイル
            </div>
          </div>
        </div>
      </div>
    )}
    
    {/* DBビューアダイアログ */}
    <DBViewerDialog 
      open={showDBViewer} 
      onOpenChange={setShowDBViewer}
    />
  </div>
  );
  }
