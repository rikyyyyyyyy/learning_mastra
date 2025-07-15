import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// Gemini Flashを使用したWeb検索ステップ
const geminiSearchStep = createStep({
  id: 'gemini-search',
  description: 'Gemini FlashのGoogle Search groundingを使用してWeb検索を実行します',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().default(10),
    language: z.string().optional().default('ja'),
    userLocation: z.object({
      country: z.string().optional().default('JP'),
      city: z.string().optional().default('Tokyo'),
      region: z.string().optional().default('Tokyo'),
    }).optional(),
  }),
  outputSchema: z.object({
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      age: z.string().optional(),
    })),
    rawResults: z.string(),
    searchTime: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { query, maxResults } = inputData;
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Gemini Flashを使用してWeb検索を実行: "${query}"`);
      
      // workflowSearchAgentを取得
      const agent = mastra?.getAgent('workflowSearchAgent');
      if (!agent) {
        throw new Error('workflowSearchAgentが見つかりません');
      }
      
      // runtimeContextからresourceIdとthreadIdを取得
      const resourceId = runtimeContext?.get('resourceId');
      const threadId = runtimeContext?.get('threadId');
      
      // エージェントにWeb検索を依頼
      const searchPrompt = `
以下について最新の情報を検索してください：

${query}

検索結果から${maxResults}件程度の関連性の高い情報を選び、それぞれについて以下の形式で整理してください：

1. タイトル: [記事やページのタイトル]
   URL: [情報源のURL]
   概要: [内容の要約]
   
2. タイトル: ...
   （以下同様）

重要：信頼性の高い情報源を優先し、最新の情報を含めてください。
`;
      
      console.log('📡 エージェントのストリームを開始...');
      const response = await agent.stream([
        {
          role: 'user',
          content: searchPrompt
        }
      ], { 
        memory: resourceId && threadId ? {
          resource: resourceId as string,
          thread: threadId as string
        } : undefined
      });
      
      // ストリームから結果を収集
      let searchResults = [];
      let rawResults = '';
      let textResponse = '';
      let success = false;
      const toolExecuted = false;
      
      console.log('🔄 ストリームを処理中...');
      
      // Gemini FlashはGoogle Search groundingを内蔵しているため、
      // ツール呼び出しではなく、直接検索結果が含まれたテキストが返される
      for await (const chunk of response.fullStream) {
        // テキストデルタの処理
        if (chunk.type === 'text-delta') {
          textResponse += chunk.textDelta;
        }
      }
      
      // 検索が実行されたかどうかはテキスト内容から判断
      if (textResponse && textResponse.includes('http')) {
        console.log('✅ Google Search groundingによる検索が実行されました');
        success = true;
      }
      
      console.log(`📝 ストリーム処理完了 - ツール実行: ${toolExecuted}, 成功: ${success}`);
      console.log(`📝 テキスト応答の長さ: ${textResponse.length}`);
      
      // Gemini Flashの応答から検索結果を抽出
      if (success && textResponse) {
        console.log('📝 Gemini Flashの応答から検索結果を抽出中...');
        const agentResponse = textResponse;
        
        // タイトル、URL、概要のパターンを抽出
        const lines = agentResponse.split('\n');
        let currentResult: { title?: string; url?: string; snippet?: string; age?: string } = {};
        
        for (const line of lines) {
          // 番号付きの結果を検出（例: "1. タイトル:"）
          const numberMatch = line.match(/^(\d+)\.\s*(タイトル:|Title:)/);
          if (numberMatch) {
            // 前の結果を保存
            if (currentResult.title && currentResult.url) {
              searchResults.push({
                title: currentResult.title,
                url: currentResult.url,
                snippet: currentResult.snippet || '',
                age: currentResult.age || ''
              });
            }
            currentResult = { 
              title: line.replace(/^\d+\.\s*(タイトル:|Title:)\s*/, '').trim() 
            };
          }
          // タイトル行の処理（番号なし）
          else if (line.includes('タイトル:') || line.includes('Title:')) {
            if (currentResult.title && currentResult.url) {
              searchResults.push({
                title: currentResult.title,
                url: currentResult.url,
                snippet: currentResult.snippet || '',
                age: currentResult.age || ''
              });
            }
            currentResult = { title: line.replace(/^(タイトル:|Title:)\s*/, '').trim() };
          }
          // URL行の処理
          else if (line.match(/^\s*(URL:|url:)/)) {
            currentResult.url = line.replace(/^\s*(URL:|url:)\s*/, '').trim();
          }
          // 概要行の処理
          else if (line.match(/^\s*(概要:|Description:|Snippet:)/)) {
            currentResult.snippet = line.replace(/^\s*(概要:|Description:|Snippet:)\s*/, '').trim();
          }
        }
        
        // 最後の結果を追加
        if (currentResult.title && currentResult.url) {
          searchResults.push({
            title: currentResult.title,
            url: currentResult.url,
            snippet: currentResult.snippet || '',
            age: currentResult.age || ''
          });
        }
        
        console.log(`📊 ${searchResults.length}件の検索結果を抽出しました`);
        rawResults = textResponse;
      }
      
      
      const searchTime = Date.now() - startTime;
      
      console.log(`✅ Gemini Flash検索完了 (${searchTime}ms)`);
      console.log(`📊 検索結果: ${searchResults.length}件`);
      
      // 結果が取得できなかった場合のフォールバック
      if (!success || searchResults.length === 0) {
        console.warn('⚠️ 検索結果が取得できませんでした');
        console.warn(`⚠️ ツール実行: ${toolExecuted}, 成功: ${success}, 結果数: ${searchResults.length}`);
        
        // エージェントの応答から何か情報が取れるか試みる
        if (textResponse && textResponse.includes(query)) {
          console.log('📝 テキスト応答から情報を抽出します');
          searchResults = [{
            title: `${query}に関する検索結果`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: textResponse.substring(0, 200) + '...',
            age: '',
          }];
        } else {
          console.warn('⚠️ 検索結果を取得できませんでした');
          // 空の結果のまま続行
        }
        
        return {
          searchResults,
          rawResults: JSON.stringify({ web: { results: searchResults } }),
          searchTime: Date.now() - startTime,
          success: true,
        };
      }
      
      return {
        searchResults,
        rawResults,
        searchTime,
        success: true,
      };
    } catch (error) {
      console.error('❌ Gemini Flash検索エラー:', error);
      console.error('エラーの詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      const searchTime = Date.now() - startTime;
      
      // エラー時は空の結果を返す
      return {
        searchResults: [],
        rawResults: '',
        searchTime,
        success: false,
      };
    }
  },
});

// 検索結果の妥当性判断ステップ
const validateSearchResultsStep = createStep({
  id: 'validate-search-results',
  description: 'workflowAgentが検索結果の妥当性を判断します',
  inputSchema: z.object({
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      age: z.string().optional(),
    })),
    rawResults: z.string(),
    searchTime: z.number(),
    success: z.boolean(),
  }),
  outputSchema: z.object({
    isValid: z.boolean(),
    validationScore: z.number(),
    feedback: z.string(),
    shouldRetry: z.boolean(),
    refinedQuery: z.string().optional(),
  }),
  execute: async ({ inputData, getInitData, runtimeContext, mastra }) => {
    const { searchResults, success } = inputData;
    const { query } = getInitData();
    
    try {
      console.log(`🧐 検索結果の妥当性を判断中...`);
      
      // workflowSearchAgentを取得
      const agent = mastra?.getAgent('workflowSearchAgent');
      if (!agent) {
        throw new Error('workflowSearchAgentが見つかりません');
      }
      
      // runtimeContextからresourceIdとthreadIdを取得
      const resourceId = runtimeContext?.get('resourceId');
      const threadId = runtimeContext?.get('threadId');
      
      // 妥当性判断プロンプト
      const validationPrompt = `以下の検索結果を評価してください：

**検索クエリ**: "${query}"
**検索結果数**: ${searchResults.length}件
**検索成功**: ${success ? 'はい' : 'いいえ'}

**検索結果**:
${searchResults.map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   概要: ${result.snippet}
   ${result.age ? `更新: ${result.age}` : ''}
`).join('\n')}

以下の観点から評価してください：

1. **関連性**: 検索結果はクエリに関連していますか？
2. **信頼性**: 情報源は信頼できますか？
3. **完全性**: 必要な情報が十分に含まれていますか？
4. **最新性**: 情報は最新ですか？

評価結果を以下のJSON形式で返してください：
{
  "validationScore": 0-100の数値,
  "isValid": true/false（60点以上でtrue）,
  "feedback": "評価の詳細説明",
  "shouldRetry": true/false（再検索が必要か）,
  "refinedQuery": "より良い検索クエリ（再検索が必要な場合のみ）"
}`;

      const { text } = await agent.generate(
        validationPrompt,
        { 
          memory: resourceId && threadId ? {
            resource: resourceId as string,
            thread: threadId as string
          } : undefined
        }
      );
      
      // 評価結果をパース
      let evaluation;
      try {
        evaluation = JSON.parse(text);
      } catch {
        // JSON解析失敗時のフォールバック
        evaluation = {
          validationScore: searchResults.length > 0 ? 60 : 30,
          isValid: searchResults.length > 3,
          feedback: text,
          shouldRetry: searchResults.length < 3,
          refinedQuery: undefined,
        };
      }
      
      console.log(`✅ 妥当性判断完了 (スコア: ${evaluation.validationScore}/100)`);
      
      return {
        isValid: evaluation.isValid || false,
        validationScore: evaluation.validationScore || 50,
        feedback: evaluation.feedback || '評価結果を取得できませんでした',
        shouldRetry: evaluation.shouldRetry || false,
        refinedQuery: evaluation.refinedQuery,
      };
    } catch (error) {
      console.error('妥当性判断エラー:', error);
      
      // エラー時のフォールバック
      return {
        isValid: searchResults.length > 0,
        validationScore: searchResults.length > 0 ? 50 : 0,
        feedback: `妥当性判断中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: searchResults.length === 0,
        refinedQuery: undefined,
      };
    }
  },
});

// 検索結果の統合と回答生成ステップ
const analyzeSearchResultsStep = createStep({
  id: 'analyze-search-results',
  description: 'workflowAgentが検索結果を統合し、質問に対する包括的な回答を生成します',
  inputSchema: z.object({
    needsRetry: z.boolean(),
    retryQuery: z.string(),
    currentRetryCount: z.number(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    detailedInfo: z.array(z.string()),
    additionalInfo: z.string(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })),
  }),
  execute: async ({ getInitData, getStepResult, runtimeContext, mastra }) => {
    const { query } = getInitData();
    const { searchResults } = getStepResult(geminiSearchStep);
    
    try {
      console.log(`🧠 検索結果を統合して回答を生成中...`);
      
      // workflowSearchAgentを取得
      const agent = mastra?.getAgent('workflowSearchAgent');
      if (!agent) {
        throw new Error('workflowSearchAgentが見つかりません');
      }
      
      // runtimeContextからresourceIdとthreadIdを取得
      const resourceId = runtimeContext?.get('resourceId');
      const threadId = runtimeContext?.get('threadId');
      
      // 統合回答生成プロンプト
      const analysisPrompt = `以下の検索結果を総合的に分析し、「${query}」という質問に対する包括的な回答を作成してください。

**検索結果**:
${searchResults.map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   概要: ${result.snippet}
   ${result.age ? `更新: ${result.age}` : ''}
`).join('\n')}

以下の点に注意してください：
1. 複数の情報源から得た情報を統合して、一貫性のある回答を作成
2. 質問に直接答える形で記述
3. 重要な情報は構造化して整理
4. 矛盾する情報がある場合は、その旨を明記
5. 専門用語は必要に応じて説明を加える

JSON形式で以下の構造で回答してください：
{
  "summary": "質問への直接的な回答（1-2段落）",
  "detailedInfo": [
    "重要なポイント1",
    "重要なポイント2",
    "重要なポイント3"
  ],
  "additionalInfo": "補足情報や注意点"
}`;

      const { text: responseText } = await agent.generate(
        analysisPrompt,
        { 
          memory: resourceId && threadId ? {
            resource: resourceId as string,
            thread: threadId as string
          } : undefined
        }
      );
      
      // 回答をパース
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        // JSON解析失敗時のフォールバック
        parsedResponse = {
          summary: responseText,
          detailedInfo: [],
          additionalInfo: ''
        };
      }
      
      // 情報源リストを作成
      const sources = searchResults.map(result => ({
        title: result.title,
        url: result.url,
      }));
      
      console.log(`✅ 回答生成完了`);
      
      return {
        summary: parsedResponse.summary || `「${query}」についての情報をまとめました。`,
        detailedInfo: parsedResponse.detailedInfo || [`検索結果: ${searchResults.length}件`],
        additionalInfo: parsedResponse.additionalInfo || '',
        sources,
      };
    } catch (error) {
      console.error('分析エラー:', error);
      
      // エラー時のフォールバック
      return {
        summary: `「${query}」についての検索を実行しましたが、分析中にエラーが発生しました。`,
        detailedInfo: [
          `検索結果: ${searchResults.length}件取得`,
          'エラーにより詳細な分析は実行できませんでした',
        ],
        additionalInfo: `エラー詳細: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sources: searchResults.map(result => ({
          title: result.title,
          url: result.url,
        })),
      };
    }
  },
});

// 最終レポート生成ステップ
const generateWebSearchReportStep = createStep({
  id: 'generate-web-search-report',
  description: 'Web検索結果と分析を統合した最終レポートを生成します',
  inputSchema: z.object({
    summary: z.string(),
    detailedInfo: z.array(z.string()),
    additionalInfo: z.string(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string(),
    })),
  }),
  outputSchema: z.object({
    report: z.string(),
    metadata: z.object({
      jobId: z.string(),
      completedAt: z.string(),
      processingTime: z.number(),
      searchEngine: z.string(),
      citationCount: z.number(),
      retryCount: z.number(),
    }),
  }),
  execute: async ({ inputData, runId, getInitData, getStepResult, runtimeContext }) => {
    const startTime = Date.now();
    
    const {
      summary,
      detailedInfo,
      additionalInfo,
      sources,
    } = inputData;
    
    const { query } = getInitData();
    const { searchTime } = getStepResult(geminiSearchStep);
    
    // 再試行回数を取得（runtimeContextから取得、デフォルトは0）
    const retryCount = runtimeContext?.get('retryCount') || 0;
    
    // シンプルなレポートを生成
    const report = `
# 「${query}」についての調査結果

## 概要
${summary}

## 詳細情報
${detailedInfo.map(info => `- ${info}`).join('\n')}

${additionalInfo ? `## 追加情報
${additionalInfo}` : ''}

## 参考資料
${sources.length > 0 
  ? sources.map((source, index) => `${index + 1}. [${source.title}](${source.url})`).join('\n')
  : '参考資料が見つかりませんでした。'
}

---
検索日時: ${new Date().toLocaleString('ja-JP')} | 情報源: ${sources.length}件
    `.trim();
    
    const processingTime = Date.now() - startTime;
    
    console.log(`📝 Web検索レポート生成完了 (${processingTime}ms)`);
    
    return {
      report,
      metadata: {
        jobId: runId || `search-job-${Date.now()}`,
        completedAt: new Date().toISOString(),
        processingTime: searchTime + processingTime,
        searchEngine: 'Google Search (Gemini Flash)',
        citationCount: sources.length,
        retryCount: retryCount as number,
      },
    };
  },
});

// 再検索判断ステップ
const checkRetryStep = createStep({
  id: 'check-retry',
  description: '検索結果が不十分かどうかを判断し、再検索が必要な場合は準備します',
  inputSchema: z.object({
    isValid: z.boolean(),
    validationScore: z.number(),
    feedback: z.string(),
    shouldRetry: z.boolean(),
    refinedQuery: z.string().optional(),
  }),
  outputSchema: z.object({
    needsRetry: z.boolean(),
    retryQuery: z.string(),
    currentRetryCount: z.number(),
  }),
  execute: async ({ inputData, getInitData, runtimeContext }) => {
    const { shouldRetry, refinedQuery, validationScore } = inputData;
    const initData = getInitData();
    const currentRetryCount = (runtimeContext?.get('retryCount') || 0) as number;
    
    // 再試行が必要かどうかを判断
    const needsRetry = shouldRetry && validationScore < 60 && currentRetryCount < 3;
    
    if (needsRetry) {
      console.log(`🔄 再検索が必要です (試行回数: ${currentRetryCount + 1}/3)`);
      runtimeContext?.set('retryCount', currentRetryCount + 1);
    }
    
    return {
      needsRetry,
      retryQuery: refinedQuery || initData.query,
      currentRetryCount: needsRetry ? currentRetryCount + 1 : currentRetryCount,
    };
  },
});

// Web検索ワークフロー（Gemini Flash版）
export const webSearchWorkflow = createWorkflow({
  id: 'web-search-workflow',
  description: 'Gemini FlashのGoogle Search groundingを使用してWeb検索と分析を行います',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().default(10),
    language: z.string().optional().default('ja'),
    userLocation: z.object({
      country: z.string().optional().default('JP'),
      city: z.string().optional().default('Tokyo'),
      region: z.string().optional().default('Tokyo'),
    }).optional(),
  }),
  outputSchema: z.object({
    report: z.string(),
    metadata: z.object({
      jobId: z.string(),
      completedAt: z.string(),
      processingTime: z.number(),
      searchEngine: z.string(),
      citationCount: z.number(),
      retryCount: z.number(),
    }),
  }),
})
  .then(geminiSearchStep)
  .then(validateSearchResultsStep)
  .then(checkRetryStep)
  .then(analyzeSearchResultsStep)
  .then(generateWebSearchReportStep)
  .commit(); 