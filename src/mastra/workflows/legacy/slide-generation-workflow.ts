import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// スライド生成ステップ
const generateSlideStep = createStep({
  id: 'generate-slide',
  description: 'GPT-4oを使用してスライド用のHTMLコードを生成します',
  inputSchema: z.object({
    topic: z.string().describe('スライドのトピック'),
    slideCount: z.number().optional().default(5).describe('スライドの枚数'),
    style: z.string().optional().default('modern').describe('スライドのスタイル'),
    language: z.string().optional().default('ja').describe('スライドの言語'),
  }),
  outputSchema: z.object({
    htmlCode: z.string(),
    generationTime: z.number(),
    slideCount: z.number(),
    style: z.string(),
  }),
  execute: async ({ inputData, runtimeContext, mastra }) => {
    const { topic, slideCount, style, language } = inputData;
    
    const startTime = Date.now();
    
    try {
      console.log(`🎨 スライド生成開始: "${topic}" (${slideCount}枚)`);
      
      // runtimeContextからresourceIdとthreadIdを取得
      const resourceId = runtimeContext?.get('resourceId');
      const threadId = runtimeContext?.get('threadId');
      
      console.log(`📝 コンテキスト情報: resourceId=${resourceId}, threadId=${threadId}`);
      
      // workflowAgentを取得
      const agent = mastra?.getAgent('workflowAgent');
      if (!agent) {
        throw new Error('workflowAgentが見つかりません');
      }
      
      // スライド生成プロンプト
      const slidePrompt = language === 'ja' 
        ? `「${topic}」について${slideCount}枚のスライドを作成してください。スタイルは${style}で、日本語で作成してください。

以下の要件に従って、完全なHTMLコードのみを出力してください：

1. **HTML構造**: 完全に独立したHTMLファイルとして作成
2. **スタイリング**: 内部CSSを使用してモダンで美しいデザイン
3. **レスポンシブ**: 様々な画面サイズに対応
4. **ナビゲーション**: キーボード（←→）とクリックでスライド切り替え
5. **アニメーション**: 滑らかなスライド遷移効果
6. **コンテンツ**: 各スライドに適切なタイトル、内容、視覚的要素

**重要**: 
- 外部ライブラリは使用せず、純粋なHTML/CSS/JavaScriptで作成
- CDNリンクも使用しない
- 完全に自己完結したHTMLコードのみを出力
- レスポンス全体がHTMLコードになるように

**スライドの構成**:
1. タイトルスライド
2. 概要/目次
3. メインコンテンツ（複数スライド）
4. まとめ/結論
5. 質疑応答/終了スライド

**デザインガイドライン**:
- ${style}スタイルを適用
- 読みやすいフォント
- 適切なコントラスト
- 視覚的な階層構造
- アイコンや図形の活用（CSS/HTMLのみで作成）`
        : `Create ${slideCount} slides about "${topic}" in ${style} style. Output only complete HTML code.`;
      
      // エージェントを使用してスライドを生成
      const { text: htmlCode } = await agent.generate(
        slidePrompt,
        { 
          memory: resourceId && threadId ? {
            resource: resourceId as string,
            thread: threadId as string
          } : undefined
        }
      );
      
      // HTMLコードのクリーニング（マークダウンコードブロックの除去）
      let cleanedHtmlCode = htmlCode.replace(/^```html\s*\n?/gm, '').replace(/\n?```$/gm, '');
      cleanedHtmlCode = cleanedHtmlCode.replace(/^```\s*\n?/gm, '').replace(/\n?```$/gm, '');
      
      const generationTime = Date.now() - startTime;
      
      console.log(`✅ スライド生成完了 (${generationTime}ms)`);
      console.log(`📄 生成されたHTMLサイズ: ${cleanedHtmlCode.length}文字`);
      
      return {
        htmlCode: cleanedHtmlCode,
        generationTime,
        slideCount,
        style,
      };
    } catch (error) {
      console.error('スライド生成エラー:', error);
      
      // フォールバック: 基本的なスライドHTML
      const fallbackHtml = `<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${topic} - スライド</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            overflow: hidden;
        }
        .slide-container {
            width: 100vw;
            height: 100vh;
            position: relative;
        }
        .slide {
            width: 100%;
            height: 100%;
            display: none;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
            box-sizing: border-box;
        }
        .slide.active {
            display: flex;
            flex-direction: column;
        }
        .slide h1 {
            font-size: 3rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .slide h2 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .slide p {
            font-size: 1.5rem;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
        }
        .navigation {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
        }
        .nav-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
        }
        .nav-btn:hover {
            background: rgba(255,255,255,0.3);
        }
        .slide-counter {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.3);
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 1rem;
        }
    </style>
</head>
<body>
    <div class="slide-container">
        <div class="slide-counter">
            <span id="current-slide">1</span> / <span id="total-slides">${slideCount}</span>
        </div>
        
        <div class="slide active">
            <h1>${topic}</h1>
            <p>エラーが発生しましたが、基本的なスライドを表示しています。</p>
        </div>
        
        <div class="slide">
            <h2>エラー詳細</h2>
            <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
        
        <div class="slide">
            <h2>ご了承ください</h2>
            <p>スライド生成中にエラーが発生しました。<br>再度お試しください。</p>
        </div>
        
        <div class="navigation">
            <button class="nav-btn" onclick="previousSlide()">← 前へ</button>
            <button class="nav-btn" onclick="nextSlide()">次へ →</button>
        </div>
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        
        document.getElementById('total-slides').textContent = totalSlides;
        
        function showSlide(n) {
            slides[currentSlide].classList.remove('active');
            currentSlide = (n + totalSlides) % totalSlides;
            slides[currentSlide].classList.add('active');
            document.getElementById('current-slide').textContent = currentSlide + 1;
        }
        
        function nextSlide() {
            showSlide(currentSlide + 1);
        }
        
        function previousSlide() {
            showSlide(currentSlide - 1);
        }
        
        // キーボードナビゲーション
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight') nextSlide();
            if (e.key === 'ArrowLeft') previousSlide();
        });
        
        // クリックナビゲーション
        document.addEventListener('click', function(e) {
            if (e.target.closest('.nav-btn')) return;
            if (e.clientX > window.innerWidth / 2) {
                nextSlide();
            } else {
                previousSlide();
            }
        });
    </script>
</body>
</html>`;
      
      const generationTime = Date.now() - startTime;
      
      return {
        htmlCode: fallbackHtml,
        generationTime,
        slideCount,
        style,
      };
    }
  },
});

// スライド生成ワークフロー
export const slideGenerationWorkflow = createWorkflow({
  id: 'slide-generation-workflow',
  description: 'スライド用のHTMLコードを生成するワークフロー',
  inputSchema: z.object({
    topic: z.string().describe('スライドのトピック'),
    slideCount: z.number().optional().default(5).describe('スライドの枚数'),
    style: z.string().optional().default('modern').describe('スライドのスタイル'),
    language: z.string().optional().default('ja').describe('スライドの言語'),
  }),
  outputSchema: z.object({
    htmlCode: z.string(),
    generationTime: z.number(),
    slideCount: z.number(),
    style: z.string(),
  }),
})
  .then(generateSlideStep)
  .commit(); 