import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { contentStoreDAO, artifactDAO } from '../db/cas-dao';
import { createPatch, applyPatch, structuredPatch } from 'diff';
import * as jsonpatch from 'fast-json-patch';

/**
 * Artifact Diff Tool
 * アーティファクトの差分生成、パッチ適用、マージを管理
 */
export const artifactDiffTool = createTool({
  id: 'artifact-diff',
  description: 'Generate diffs, apply patches, and merge artifact revisions',
  inputSchema: z.object({
    action: z.enum(['diff', 'patch', 'merge', 'apply_edits']),
    
    // Diff parameters
    artifactId: z.string().optional(),
    fromRevision: z.string().optional(),
    toRevision: z.string().optional(),
    format: z.enum(['unified', 'json_patch', 'structured']).optional().default('unified'),
    
    // Patch parameters
    baseRevision: z.string().optional(),
    patch: z.string().optional(),
    patchFormat: z.enum(['unified', 'json_patch', 'edits']).optional().default('unified'),
    
    // Merge parameters
    sourceRevision: z.string().optional(),
    targetRevision: z.string().optional(),
    strategy: z.enum(['ours', 'theirs', 'auto']).optional().default('auto'),
    
    // Edit operations
    edits: z.array(z.object({
      type: z.enum(['find_replace', 'line_range', 'append', 'prepend']),
      find: z.string().optional(),
      replace: z.string().optional(),
      nth: z.number().optional().default(1),
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
      text: z.string().optional(),
    })).optional(),
    
    // Commit parameters
    commitMessage: z.string().optional(),
    author: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    artifactId: z.string().optional(),
    revisionId: z.string().optional(),
    contentHash: z.string().optional(),
    diff: z.string().optional(),
    patchApplied: z.boolean().optional(),
    mergeResult: z.object({
      revisionId: z.string(),
      conflicts: z.array(z.string()).optional(),
      resolved: z.boolean(),
    }).optional(),
    stats: z.object({
      additions: z.number(),
      deletions: z.number(),
      changes: z.number(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { action } = context;
    
    try {
      switch (action) {
        case 'diff': {
          const { artifactId, fromRevision, toRevision, format } = context;
          
          if (!artifactId || !fromRevision || !toRevision) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, fromRevision, toRevision',
            };
          }
          
          // リビジョンのコンテンツを取得
          const fromRev = await artifactDAO.getRevision(fromRevision);
          const toRev = await artifactDAO.getRevision(toRevision);
          
          if (!fromRev || !toRev) {
            return {
              success: false,
              action,
              error: 'One or both revisions not found',
            };
          }
          
          const fromContent = await contentStoreDAO.retrieveDecoded(fromRev.content_hash) || '';
          const toContent = await contentStoreDAO.retrieveDecoded(toRev.content_hash) || '';
          
          let diffResult: string;
          let stats = { additions: 0, deletions: 0, changes: 0 };
          
          if (format === 'json_patch') {
            // JSONとして解析して差分を生成
            try {
              const fromJson = JSON.parse(fromContent);
              const toJson = JSON.parse(toContent);
              const patches = jsonpatch.compare(fromJson, toJson);
              diffResult = JSON.stringify(patches, null, 2);
              stats.changes = patches.length;
            } catch (e) {
              // JSONでない場合は通常のテキスト差分
              diffResult = createPatch('content', fromContent, toContent, fromRevision, toRevision);
            }
          } else if (format === 'structured') {
            // 構造化された差分情報
            const patch = structuredPatch('content', 'content', fromContent, toContent, fromRevision, toRevision);
            diffResult = JSON.stringify(patch, null, 2);
            stats.additions = patch.hunks.reduce((sum, hunk) => 
              sum + hunk.lines.filter(l => l.startsWith('+')).length, 0);
            stats.deletions = patch.hunks.reduce((sum, hunk) => 
              sum + hunk.lines.filter(l => l.startsWith('-')).length, 0);
          } else {
            // Unified diff（デフォルト）
            diffResult = createPatch('content', fromContent, toContent, fromRevision, toRevision);
            const lines = diffResult.split('\n');
            stats.additions = lines.filter(l => l.startsWith('+')).length;
            stats.deletions = lines.filter(l => l.startsWith('-')).length;
          }
          
          return {
            success: true,
            action,
            artifactId,
            diff: diffResult,
            stats,
          };
        }
        
        case 'patch': {
          const { artifactId, baseRevision, patch, patchFormat, commitMessage, author } = context;
          
          if (!artifactId || !baseRevision || !patch) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, baseRevision, patch',
            };
          }
          
          // ベースリビジョンのコンテンツを取得
          const baseRev = await artifactDAO.getRevision(baseRevision);
          if (!baseRev) {
            return {
              success: false,
              action,
              error: 'Base revision not found',
            };
          }
          
          const baseContent = await contentStoreDAO.retrieveDecoded(baseRev.content_hash) || '';
          let patchedContent: string;
          
          if (patchFormat === 'json_patch') {
            // JSON Patchを適用
            try {
              const baseJson = JSON.parse(baseContent);
              const patches = JSON.parse(patch);
              const result = jsonpatch.applyPatch(baseJson, patches);
              patchedContent = JSON.stringify(result.newDocument, null, 2);
            } catch (e) {
              return {
                success: false,
                action,
                error: `Failed to apply JSON patch: ${e instanceof Error ? e.message : 'Unknown error'}`,
              };
            }
          } else if (patchFormat === 'edits') {
            // カスタム編集操作を適用
            patchedContent = baseContent;
            const edits = JSON.parse(patch);
            
            for (const edit of edits) {
              if (edit.type === 'find_replace' && edit.find && edit.replace !== undefined) {
                let count = 0;
                const nth = edit.nth || 1;
                patchedContent = patchedContent.replace(new RegExp(edit.find, 'g'), (match) => {
                  count++;
                  return count === nth ? edit.replace : match;
                });
              } else if (edit.type === 'line_range' && edit.lineStart && edit.lineEnd && edit.text !== undefined) {
                const lines = patchedContent.split('\n');
                lines.splice(edit.lineStart - 1, edit.lineEnd - edit.lineStart + 1, edit.text);
                patchedContent = lines.join('\n');
              } else if (edit.type === 'append' && edit.text) {
                patchedContent += edit.text;
              } else if (edit.type === 'prepend' && edit.text) {
                patchedContent = edit.text + patchedContent;
              }
            }
          } else {
            // Unified diffを適用
            const result = applyPatch(baseContent, patch);
            if (result === false) {
              return {
                success: false,
                action,
                error: 'Failed to apply unified diff patch',
              };
            }
            patchedContent = result;
          }
          
          // 新しいコンテンツを保存
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: 'Artifact not found',
            };
          }
          
          const newHash = await contentStoreDAO.store(patchedContent, artifact.mime_type);
          
          // 新しいリビジョンをコミット
          const newRevision = await artifactDAO.commit(
            artifactId,
            newHash,
            commitMessage || `Applied patch to ${baseRevision}`,
            author || 'system',
            [baseRevision]
          );
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: newRevision.revision_id,
            contentHash: newHash,
            patchApplied: true,
          };
        }
        
        case 'merge': {
          const { artifactId, sourceRevision, targetRevision, strategy, commitMessage, author } = context;
          
          if (!artifactId || !sourceRevision || !targetRevision) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, sourceRevision, targetRevision',
            };
          }
          
          // 両方のリビジョンのコンテンツを取得
          const sourceRev = await artifactDAO.getRevision(sourceRevision);
          const targetRev = await artifactDAO.getRevision(targetRevision);
          
          if (!sourceRev || !targetRev) {
            return {
              success: false,
              action,
              error: 'One or both revisions not found',
            };
          }
          
          const sourceContent = await contentStoreDAO.retrieveDecoded(sourceRev.content_hash) || '';
          const targetContent = await contentStoreDAO.retrieveDecoded(targetRev.content_hash) || '';
          
          let mergedContent: string;
          const conflicts: string[] = [];
          
          // 簡易マージ戦略
          if (strategy === 'ours') {
            mergedContent = sourceContent;
          } else if (strategy === 'theirs') {
            mergedContent = targetContent;
          } else {
            // 自動マージ（簡易実装: 行単位での比較）
            const sourceLines = sourceContent.split('\n');
            const targetLines = targetContent.split('\n');
            const mergedLines: string[] = [];
            
            const maxLength = Math.max(sourceLines.length, targetLines.length);
            for (let i = 0; i < maxLength; i++) {
              const sourceLine = sourceLines[i] || '';
              const targetLine = targetLines[i] || '';
              
              if (sourceLine === targetLine) {
                mergedLines.push(sourceLine);
              } else if (!sourceLine) {
                mergedLines.push(targetLine);
              } else if (!targetLine) {
                mergedLines.push(sourceLine);
              } else {
                // 競合が発生
                conflicts.push(`Line ${i + 1}: "${sourceLine}" vs "${targetLine}"`);
                mergedLines.push(`<<<<<<< source\n${sourceLine}\n=======\n${targetLine}\n>>>>>>> target`);
              }
            }
            
            mergedContent = mergedLines.join('\n');
          }
          
          // マージ結果を保存
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: 'Artifact not found',
            };
          }
          
          const mergedHash = await contentStoreDAO.store(mergedContent, artifact.mime_type);
          
          // マージコミットを作成
          const mergeRevision = await artifactDAO.commit(
            artifactId,
            mergedHash,
            commitMessage || `Merged ${sourceRevision} into ${targetRevision}`,
            author || 'system',
            [sourceRevision, targetRevision]
          );
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: mergeRevision.revision_id,
            contentHash: mergedHash,
            mergeResult: {
              revisionId: mergeRevision.revision_id,
              conflicts: conflicts.length > 0 ? conflicts : undefined,
              resolved: conflicts.length === 0,
            },
          };
        }
        
        case 'apply_edits': {
          const { artifactId, edits, commitMessage, author } = context;
          
          if (!artifactId || !edits || edits.length === 0) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, edits',
            };
          }
          
          // 現在のコンテンツを取得
          const artifact = await artifactDAO.get(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: 'Artifact not found',
            };
          }
          
          const currentRev = await artifactDAO.getRevision(artifact.current_revision);
          if (!currentRev) {
            return {
              success: false,
              action,
              error: 'Current revision not found',
            };
          }
          
          let content = await contentStoreDAO.retrieveDecoded(currentRev.content_hash) || '';
          
          // 編集操作を適用
          for (const edit of edits) {
            if (edit.type === 'find_replace' && edit.find && edit.replace !== undefined) {
              let count = 0;
              const nth = edit.nth || 1;
              content = content.replace(new RegExp(edit.find, 'g'), (match) => {
                count++;
                return count === nth ? edit.replace : match;
              });
            } else if (edit.type === 'line_range' && edit.lineStart && edit.lineEnd && edit.text !== undefined) {
              const lines = content.split('\n');
              lines.splice(edit.lineStart - 1, edit.lineEnd - edit.lineStart + 1, edit.text);
              content = lines.join('\n');
            } else if (edit.type === 'append' && edit.text) {
              content += edit.text;
            } else if (edit.type === 'prepend' && edit.text) {
              content = edit.text + content;
            }
          }
          
          // 変更を保存
          const newHash = await contentStoreDAO.store(content, artifact.mime_type);
          
          // 新しいリビジョンをコミット
          const newRevision = await artifactDAO.commit(
            artifactId,
            newHash,
            commitMessage || `Applied ${edits.length} edits`,
            author || 'system',
            [artifact.current_revision]
          );
          
          return {
            success: true,
            action,
            artifactId,
            revisionId: newRevision.revision_id,
            contentHash: newHash,
            stats: {
              additions: 0,
              deletions: 0,
              changes: edits.length,
            },
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
      console.error('Artifact Diff Tool error:', error);
      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});