import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Brain, Zap, Shield, ChevronRight, Sparkles, Bot, Rocket, Check } from "lucide-react";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-purple-950 dark:via-gray-900 dark:to-blue-950 py-20 px-4">
        <div className="absolute inset-0 bg-grid-gray-100/10 dark:bg-grid-gray-700/10 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">次世代AIエージェントプラットフォーム</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            あなたのビジネスを加速する
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400">
              インテリジェントAIエージェント
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            最先端のAI技術を活用して、複雑なタスクを自動化し、
            チームの生産性を10倍に向上させます
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/protected/chat" className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-semibold transition-colors">
              無料で始める
              <ChevronRight className="w-5 h-5" />
            </Link>
            <button className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-8 py-4 rounded-lg font-semibold border border-gray-200 dark:border-gray-700 transition-colors">
              デモを見る
              <Bot className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              パワフルな機能
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              ビジネスのあらゆる場面で活躍する高度な機能を提供
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-6">
                <Brain className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                高度な自然言語処理
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                最新のLLMを活用し、人間のような自然な会話と複雑なタスクの理解を実現
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-6">
                <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                リアルタイム処理
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                瞬時のレスポンスと並列処理により、大量のタスクを効率的に処理
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-2xl hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                エンタープライズセキュリティ
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                SOC2準拠、エンドツーエンド暗号化で企業データを安全に保護
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                なぜ私たちのAIエージェントを選ぶのか
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      90%の作業時間削減
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      繰り返しタスクを自動化し、より創造的な業務に集中できます
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      24/7稼働
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      休むことなく働き続け、顧客対応やデータ処理を継続的に実行
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      カスタマイズ可能
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      あなたのビジネスニーズに合わせて、AIの動作を細かく調整
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl p-8">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Bot className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-gray-900 dark:text-white">AIアシスタント</span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        「今月の売上レポートを作成してください」
                      </p>
                    </div>
                    <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-3 ml-8">
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        「承知しました。データを分析してレポートを生成します...」
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-800 dark:to-blue-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            今すぐAIエージェントで
            <span className="block">ビジネスを変革しましょう</span>
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            14日間の無料トライアル。クレジットカード不要。
          </p>
          <Link href="/protected/chat" className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-purple-600 px-8 py-4 rounded-lg font-semibold transition-colors">
            <Rocket className="w-5 h-5" />
            無料トライアルを開始
          </Link>
        </div>
      </section>
    </div>
  );
}
