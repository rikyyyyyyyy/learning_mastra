import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { artifactDAO, contentStoreDAO } from '../db/cas-dao';
import { ensureRole, requireStage, allSubtasksCompleted, setNetworkStage, ERROR_CODES } from './routing-validators';

// ジョブ結果を保存するディレクトリ
const JOB_RESULTS_DIR = path.join(process.cwd(), '.job-results');
const SLIDES_DIR = path.join(process.cwd(), '.generated-slides');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(JOB_RESULTS_DIR)) {
  fs.mkdirSync(JOB_RESULTS_DIR, { recursive: true });
}
// スライド保存先も作成
if (!fs.existsSync(SLIDES_DIR)) {
  fs.mkdirSync(SLIDES_DIR, { recursive: true });
}

/**
 * CEOエージェント専用ツール
 * ネットワーク全体の最終成果物を生成・保存
 */
// タスクタイプ別の最終成果物スキーマ
const SlideGenerationFinalResultSchema = z.object({
  htmlCode: z.string().min(1, 'htmlCode is required and must be non-empty'),
  topic: z.string().optional(),
  slideCount: z.number().int().positive().optional(),
  style: z.string().optional(),
  generationTime: z.union([z.string(), z.number()]).optional(),
}).describe('Final result for slide-generation task');

export const finalResultTool = createTool({
  id: 'final-result-save',
  description: 'Generate and save the final result of the entire network task after consolidating sub-task results (CEO Agent only)',
  inputSchema: z.object({
    networkId: z.string().describe('The network ID (same as jobId)'),
    taskType: z.enum(['web-search', 'slide-generation', 'weather', 'other']).describe('Type of the overall task'),
    finalResult: z.any().describe('The consolidated final result/output of the network'),
    metadata: z.object({
      totalIterations: z.number().optional(),
      agentsInvolved: z.array(z.string()).optional(),
      executionTime: z.string().optional(),
      subTasksSummary: z.array(z.object({
        stepNumber: z.number().optional(),
        taskType: z.string(),
        description: z.string(),
        completed: z.boolean(),
      })).optional(),
    }).optional().describe('Additional metadata about the execution'),
  }).superRefine((obj, ctx) => {
    if (obj.taskType === 'slide-generation') {
      const result = SlideGenerationFinalResultSchema.safeParse(obj.finalResult);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid finalResult for slide-generation: ${issue.message}`,
            path: ['finalResult', ...(issue.path ?? [])],
          });
        }
      }
    }
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    savedPath: z.string().optional(),
    errorCode: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { networkId, taskType, finalResult, metadata } = context;
    
    try {
      // CEO専用（runtimeContext.agentRoleがあれば検証）
      const roleCheck = ensureRole(runtimeContext, ['CEO']);
      if (!roleCheck.success) {
        return { success: false, message: (roleCheck as { message?: string }).message || 'Role check failed', errorCode: ERROR_CODES.ROLE_FORBIDDEN };
      }
      // ステージ検証（executingでも全完了なら自動でfinalizingへ昇格）
      const st = await requireStage(networkId, ['executing', 'finalizing']);
      if (!st.success) {
        return { success: false, message: (st as { message?: string }).message || 'Stage check failed', errorCode: ERROR_CODES.INVALID_STAGE };
      }
      const ready = await allSubtasksCompleted(networkId);
      if (!ready.success) {
        return { success: false, message: (ready as { message?: string }).message || 'Subtasks not complete', errorCode: ERROR_CODES.SUBTASKS_INCOMPLETE };
      }
      // executing なら finalizing に昇格
      try { await setNetworkStage(networkId, 'finalizing'); } catch {}
      // 1. アーティファクトとして最終成果物を保存
      let artifactRef = null;
      let mimeType = 'text/plain';
      let contentToStore = '';
      
      // タスクタイプに応じたMIMEタイプとコンテンツを設定
      if (taskType === 'slide-generation' && finalResult.htmlCode) {
        mimeType = 'text/html';
        contentToStore = finalResult.htmlCode;
      } else if (typeof finalResult === 'string') {
        contentToStore = finalResult;
      } else {
        mimeType = 'application/json';
        contentToStore = JSON.stringify(finalResult, null, 2);
      }
      
      // アーティファクトを作成
      const artifact = await artifactDAO.create(
        networkId,
        mimeType,
        undefined, // taskIdは最終成果物なのでundefined
        { type: 'final_result', taskType }
      );
      
      // コンテンツを保存
      const contentHash = await contentStoreDAO.store(contentToStore, mimeType);
      
      // リビジョンをコミット
      const revision = await artifactDAO.commit(
        artifact.artifact_id,
        contentHash,
        `Final result for ${taskType} task`,
        'ceo-agent',
        []
      );
      
      artifactRef = {
        artifactId: artifact.artifact_id,
        revisionId: revision.revision_id,
        reference: `ref:${contentHash.substring(0, 12)}`,
        contentHash: contentHash,
      };
      
      console.log(`🎨 最終成果物をアーティファクトとして保存: ${artifactRef.reference}`);
      
      // 2. 従来形式のジョブ結果も作成（後方互換性のため）
      const jobResult = {
        jobId: networkId,
        workflowId: 'workflow',
        status: 'completed',
        result: {
          success: true,
          taskType: taskType,
          result: finalResult,
          // アーティファクト参照を追加
          artifactRef: artifactRef,
          artifact: artifactRef ? artifactRef.reference : finalResult,
          executionSummary: {
            totalIterations: metadata?.totalIterations || 0,
            agentsInvolved: metadata?.agentsInvolved || ['ceo-agent', 'manager-agent', 'worker-agent'],
            executionTime: metadata?.executionTime || 'unknown',
          },
          subTasksSummary: metadata?.subTasksSummary || [],
        },
        completedAt: new Date().toISOString(),
      };
      
      // ファイルパスを生成
      const filePath = path.join(JOB_RESULTS_DIR, `${networkId}.json`);
      
      // JSONファイルとして保存（後方互換性のため維持）
      fs.writeFileSync(filePath, JSON.stringify(jobResult, null, 2));
      
      console.log(`✅ 最終成果物を保存しました: ${filePath}`);
      console.log(`📦 アーティファクト参照: ${artifactRef.reference}`);

      // 2.5 スライドタスクの場合、.generated-slides にHTMLを保存してUIから再アクセス可能にする
      if (taskType === 'slide-generation' && typeof finalResult?.htmlCode === 'string') {
        try {
          const safeName = `${networkId}.html`;
          const slidePath = path.join(SLIDES_DIR, safeName);
          fs.writeFileSync(slidePath, finalResult.htmlCode, 'utf-8');
          console.log(`🖼️ スライドHTMLを保存しました: ${slidePath}`);
        } catch (e) {
          console.warn('⚠️ スライドHTMLの保存に失敗しました（処理は継続）:', e);
        }
      }
      
      // DBにも結果を保存し、ステータス更新
      try {
        const { updateJobStatus, storeJobResult } = await import('../../tools/job-status-tool');
        await storeJobResult(networkId, jobResult.result, 'workflow');
        await updateJobStatus(networkId, 'completed', { result: jobResult.result });
      } catch (error) {
        console.warn('⚠️ ジョブステータスの更新に失敗（処理は継続）:', error);
      }
      
      // ステージ完了
      try { await setNetworkStage(networkId, 'completed'); } catch {}

      return {
        success: true,
        message: `Successfully saved final result for network ${networkId}`,
        savedPath: filePath,
      };
    } catch (error) {
      console.error('❌ 最終成果物の保存エラー:', error);
      
      // エラー時のジョブステータス更新
      try {
        const { updateJobStatus } = await import('../../tools/job-status-tool');
        updateJobStatus(networkId, 'failed', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      } catch (statusError) {
        console.warn('⚠️ エラーステータスの更新に失敗:', statusError);
      }
      
      return { success: false, message: `Failed to save final result: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  },
});
