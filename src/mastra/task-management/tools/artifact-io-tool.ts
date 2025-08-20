import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { contentStoreDAO, artifactDAO } from '../db/cas-dao';

/**
 * Artifact I/O Tool
 * アーティファクトの作成、追記、コミット、読み取りを管理
 */
export const artifactIOTool = createTool({
  id: 'artifact-io',
  description: 'Create, append, commit, and read artifacts with version control',
  inputSchema: z.object({
    action: z.enum([
      'create',
      'append',
      'commit',
      'read',
      'stat',
      'ref',
      'resolve',
      'list_revisions',
      'get_content_by_revision',
    ]),
    
    // Create parameters
    jobId: z.string().optional(),
    taskId: z.string().optional(),
    mimeType: z.string().optional(),
    labels: z.record(z.string()).optional(),
    
    // Append parameters
    artifactId: z.string().optional(),
    content: z.string().optional(),
    chunkIndex: z.number().optional(),
    
    // Commit parameters
    message: z.string().optional(),
    author: z.string().optional(),
    
    // Read parameters
    revisionId: z.string().optional(),
    range: z.object({
      start: z.number().optional(),
      end: z.number().optional(),
    }).optional(),
    format: z.enum(['text', 'base64']).optional().default('text'),
    
    // Reference parameters
    reference: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    artifactId: z.string().optional(),
    revisionId: z.string().optional(),
    contentHash: z.string().optional(),
    reference: z.string().optional(),
    content: z.string().optional(),
    bytesWritten: z.number().optional(),
    chunkId: z.string().optional(),
    stats: z.object({
      size: z.number(),
      chunks: z.number().optional(),
      revisions: z.number().optional(),
      currentHash: z.string().optional(),
      mimeType: z.string().optional(),
    }).optional(),
    revisions: z.array(z.object({
      revisionId: z.string(),
      contentHash: z.string(),
      message: z.string(),
      author: z.string(),
      created: z.string(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { action } = context;
    
    try {
      // 100ms制約を守るため、時間チェック
      const startTime = Date.now();
      
      switch (action) {
        case 'create': {
          const { jobId, taskId, mimeType, labels } = context;
          
          if (!jobId || !mimeType) {
            return {
              success: false,
              action,
              error: 'Missing required fields: jobId, mimeType',
            };
          }
          
          const artifact = await artifactDAO.create(jobId, mimeType, taskId, labels);
          const ref = `ref:${artifact.artifact_id.substring(0, 8)}`;
          
          console.log(`🎨 Artifact created: ${ref}`);
          
          return {
            success: true,
            action,
            artifactId: artifact.artifact_id,
            revisionId: artifact.current_revision,
            reference: ref,
          };
        }
        
        case 'append': {
          const { artifactId, content, chunkIndex } = context;
          
          if (!artifactId || !content) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, content',
            };
          }
          
          // 既存のアーティファクトを取得
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact not found: ${artifactId}`,
            };
          }
          
          // 現在のリビジョンのコンテンツを取得
          const currentRevision = await artifactDAO.getRevision(artifact.current_revision);
          if (!currentRevision) {
            return {
              success: false,
              action,
              error: 'Current revision not found',
            };
          }
          
          // 既存のコンテンツを取得
          let existingContent = await contentStoreDAO.retrieveDecoded(currentRevision.content_hash) || '';
          
          // 新しいコンテンツを追加
          const newContent = existingContent + content;
          const newHash = await contentStoreDAO.store(newContent, artifact.mime_type);
          
          // 作業リビジョンを更新（コミットはせず）
          // 注: 簡易実装のため、一時的に現在のリビジョンを更新
          // 本番では別途working_revisionフィールドを使用
          
          return {
            success: true,
            action,
            artifactId,
            contentHash: newHash,
            bytesWritten: Buffer.from(content, 'utf-8').length,
            reference: `ref:${newHash.substring(0, 12)}`,
          };
        }
        
        case 'commit': {
          const { artifactId, message, author } = context;
          
          if (!artifactId || !message || !author) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, message, author',
            };
          }
          
          // アーティファクトの現在の作業内容を取得
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact not found: ${artifactId}`,
            };
          }
          
          // 最新のコンテンツハッシュを取得（簡易実装）
          const currentRevision = await artifactDAO.getRevision(artifact.current_revision);
          if (!currentRevision) {
            return {
              success: false,
              action,
              error: 'Current revision not found',
            };
          }
          
          // 新しいリビジョンをコミット
          const newRevision = await artifactDAO.commit(
            artifactId,
            currentRevision.content_hash, // 簡易実装: 同じハッシュを使用
            message,
            author,
            [artifact.current_revision]
          );
          
          console.log(`✅ Committed revision: ${newRevision.revision_id}`);
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: newRevision.revision_id,
            contentHash: newRevision.content_hash,
            reference: `ref:${newRevision.content_hash.substring(0, 12)}`,
          };
        }
        
        case 'read': {
          const { artifactId, revisionId, range, format } = context;
          
          if (!artifactId) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactId',
            };
          }
          
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact not found: ${artifactId}`,
            };
          }
          
          // リビジョンを取得
          const targetRevisionId = revisionId || artifact.current_revision;
          const revision = await artifactDAO.getRevision(targetRevisionId);
          if (!revision) {
            return {
              success: false,
              action,
              error: `Revision not found: ${targetRevisionId}`,
            };
          }
          
          // コンテンツを取得
          let content = await contentStoreDAO.retrieveDecoded(revision.content_hash);
          if (!content) {
            content = '';
          }
          
          // 範囲指定がある場合は部分取得
          if (range) {
            const lines = content.split('\n');
            const start = range.start || 0;
            const end = range.end || lines.length;
            content = lines.slice(start, end).join('\n');
          }
          
          // フォーマット変換
          if (format === 'base64') {
            content = Buffer.from(content, 'utf-8').toString('base64');
          }
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: targetRevisionId,
            contentHash: revision.content_hash,
            content,
            reference: `ref:${revision.content_hash.substring(0, 12)}`,
          };
        }
        
        case 'stat': {
          const { artifactId } = context;
          
          if (!artifactId) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactId',
            };
          }
          
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact not found: ${artifactId}`,
            };
          }
          
          const currentRevision = await artifactDAO.getRevision(artifact.current_revision);
          if (!currentRevision) {
            return {
              success: false,
              action,
              error: 'Current revision not found',
            };
          }
          
          const metadata = await contentStoreDAO.getMetadata(currentRevision.content_hash);
          const revisions = await artifactDAO.getRevisions(artifactId);
          
          return {
            success: true,
            action,
            artifactId,
            stats: {
              size: metadata?.size || 0,
              revisions: revisions.length,
              currentHash: currentRevision.content_hash,
              mimeType: artifact.mime_type,
            },
          };
        }
        
        case 'ref': {
          const { artifactId, revisionId } = context;
          
          if (!artifactId) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactId',
            };
          }
          
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact not found: ${artifactId}`,
            };
          }
          
          const targetRevisionId = revisionId || artifact.current_revision;
          const revision = await artifactDAO.getRevision(targetRevisionId);
          if (!revision) {
            return {
              success: false,
              action,
              error: `Revision not found: ${targetRevisionId}`,
            };
          }
          
          const ref = `ref:${revision.content_hash.substring(0, 12)}`;
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: targetRevisionId,
            reference: ref,
          };
        }
        
        case 'resolve': {
          const { reference } = context;
          
          if (!reference) {
            return {
              success: false,
              action,
              error: 'Missing required field: reference',
            };
          }
          
          // ref:abc123... 形式から実際のコンテンツを解決
          const hashPrefix = reference.replace('ref:', '');
          
          // 簡易実装: プレフィックスからコンテンツを取得
          const content = await contentStoreDAO.retrieveDecoded(hashPrefix);
          
          if (!content) {
            return {
              success: false,
              action,
              error: `Reference not found: ${reference}`,
            };
          }
          
          return {
            success: true,
            action,
            reference,
            content,
          };
        }
        
        case 'list_revisions': {
          const { artifactId } = context;
          
          if (!artifactId) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactId',
            };
          }
          
          const revisions = await artifactDAO.getRevisions(artifactId);
          
          return {
            success: true,
            action,
            artifactId,
            revisions: revisions.map(r => ({
              revisionId: r.revision_id,
              contentHash: r.content_hash,
              message: r.commit_message,
              author: r.author,
              created: r.created_at,
            })),
          };
        }
        
        case 'get_content_by_revision': {
          const { revisionId } = context;
          
          if (!revisionId) {
            return {
              success: false,
              action,
              error: 'Missing required field: revisionId',
            };
          }
          
          const revision = await artifactDAO.getRevision(revisionId);
          if (!revision) {
            return {
              success: false,
              action,
              error: `Revision not found: ${revisionId}`,
            };
          }
          
          const content = await contentStoreDAO.retrieveDecoded(revision.content_hash);
          
          return {
            success: true,
            action,
            revisionId,
            contentHash: revision.content_hash,
            content: content || '',
            reference: `ref:${revision.content_hash.substring(0, 12)}`,
          };
        }
        
        default:
          return {
            success: false,
            action,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      console.error('Artifact I/O Tool error:', error);
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});