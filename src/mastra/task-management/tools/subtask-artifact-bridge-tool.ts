import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { contentStoreDAO, artifactDAO } from '../db/cas-dao';
import { createTool as _ } from '@mastra/core/tools';

/**
 * Subtask Artifact Bridge Tool
 * - Worker: 小タスクごとのドラフト成果物（テキスト/HTML等）をアーティファクトとして保存
 * - Manager: 最新ドラフトの取得/差分/編集/最終結果への反映
 *
 * 目的: 大きなテキストを都度丸ごとやり取りしない（CAS + diff/edits により省トークン・省帯域）
 */
export const subtaskArtifactTool = createTool({
  id: 'subtask-artifact',
  description: 'Manage per-subtask artifacts: ensure, write drafts, read, diff/patch, and finalize into task_result',
  inputSchema: z.object({
    action: z.enum([
      'ensure',              // ensure artifact for (jobId, taskId)
      'worker_commit_text',  // worker saves/commits a draft text
      'read_latest',         // read latest text
      'diff_with_text',      // diff latest vs provided text
      'apply_edits',         // apply structured edits and commit
      'finalize_to_task',    // write latest artifact content into network_tasks.task_result
    ]),

    jobId: z.string().optional(),
    taskId: z.string().optional(),
    mimeType: z.string().optional(),
    taskType: z.string().optional(),
    labels: z.record(z.string()).optional(),

    // payloads
    content: z.string().optional(),   // for worker_commit_text / diff_with_text base
    edits: z.array(z.object({
      type: z.enum(['find_replace', 'line_range', 'append', 'prepend']),
      find: z.string().optional(),
      replace: z.string().optional(),
      nth: z.number().optional().default(1),
      lineStart: z.number().optional(),
      lineEnd: z.number().optional(),
      text: z.string().optional(),
    })).optional(),

    // optional commit info
    message: z.string().optional(),
    author: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    artifactId: z.string().optional(),
    revisionId: z.string().optional(),
    reference: z.string().optional(),
    content: z.string().optional(),
    diff: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { action } = context;
    try {
      const pickMime = (tt?: string, fallback?: string) => {
        const t = (tt || '').toLowerCase();
        if (t.includes('slide') || t.includes('html')) return 'text/html';
        if (t.includes('code')) return 'text/markdown';
        if (t.includes('web') || t.includes('search') || t.includes('report') || t.includes('analysis')) return 'text/markdown';
        if (t.includes('weather')) return 'text/markdown';
        return fallback || 'text/markdown';
      };
      if (action === 'ensure') {
        const { jobId, taskId, mimeType, labels, taskType } = context;
        if (!jobId || !taskId) {
          return { success: false, action, error: 'jobId and taskId are required' };
        }
        const existing = await artifactDAO.findByTaskId(taskId);
        if (existing) {
          return { success: true, action, artifactId: existing.artifact_id, reference: `rev:${existing.current_revision}` };
        }
        const art = await artifactDAO.create(jobId, mimeType || pickMime(taskType), taskId, labels);
        return { success: true, action, artifactId: art.artifact_id, reference: `rev:${art.current_revision}` };
      }

      if (action === 'worker_commit_text') {
        const { jobId, taskId, content, mimeType, message, author, taskType } = context;
        if (!jobId || !taskId || typeof content !== 'string') {
          return { success: false, action, error: 'jobId, taskId and content are required' };
        }
        const art = (await artifactDAO.findByTaskId(taskId)) || (await artifactDAO.create(jobId, mimeType || pickMime(taskType), taskId));
        const hash = await contentStoreDAO.store(content, art.mime_type);
        const rev = await artifactDAO.commit(art.artifact_id, hash, message || 'worker draft', author || 'worker-network', [art.current_revision]);
        return { success: true, action, artifactId: art.artifact_id, revisionId: rev.revision_id, reference: `ref:${hash.substring(0,12)}` };
      }

      if (action === 'read_latest') {
        const { taskId } = context;
        if (!taskId) return { success: false, action, error: 'taskId is required' };
        const art = await artifactDAO.findByTaskId(taskId);
        if (!art) return { success: false, action, error: 'Artifact not found for task' };
        const rev = await artifactDAO.getRevision(art.current_revision);
        if (!rev) return { success: false, action, error: 'Current revision not found' };
        const text = (await contentStoreDAO.retrieveDecoded(rev.content_hash)) || '';
        return { success: true, action, artifactId: art.artifact_id, revisionId: art.current_revision, content: text };
      }

      if (action === 'diff_with_text') {
        const { taskId, content } = context;
        if (!taskId || typeof content !== 'string') return { success: false, action, error: 'taskId and content are required' };
        const art = await artifactDAO.findByTaskId(taskId);
        if (!art) return { success: false, action, error: 'Artifact not found for task' };
        const currentRev = await artifactDAO.getRevision(art.current_revision);
        if (!currentRev) return { success: false, action, error: 'Current revision not found' };
        const currentText = (await contentStoreDAO.retrieveDecoded(currentRev.content_hash)) || '';
        // Use unified diff (small and human-friendly)
        const { createPatch } = await import('diff');
        const diffText = createPatch('subtask', currentText, content, art.current_revision, 'proposed');
        return { success: true, action, artifactId: art.artifact_id, revisionId: art.current_revision, diff: diffText };
      }

      if (action === 'apply_edits') {
        const { taskId, edits, message, author } = context;
        if (!taskId || !edits || edits.length === 0) return { success: false, action, error: 'taskId and edits are required' };
        const art = await artifactDAO.findByTaskId(taskId);
        if (!art) return { success: false, action, error: 'Artifact not found for task' };
        // Reuse artifact-diff-tool behavior inline (edits over current)
        const currentRev = await artifactDAO.getRevision(art.current_revision);
        if (!currentRev) return { success: false, action, error: 'Current revision not found' };
        let text = (await contentStoreDAO.retrieveDecoded(currentRev.content_hash)) || '';
        for (const e of edits) {
          if (e.type === 'find_replace' && e.find && e.replace !== undefined) {
            let count = 0; const nth = e.nth || 1;
            text = text.replace(new RegExp(e.find, 'g'), (m) => { count++; return count === nth ? (e.replace as string) : m; });
          } else if (e.type === 'line_range' && e.lineStart && e.lineEnd && e.text !== undefined) {
            const lines = text.split('\n');
            lines.splice(e.lineStart - 1, e.lineEnd - e.lineStart + 1, e.text);
            text = lines.join('\n');
          } else if (e.type === 'append' && e.text) {
            text += e.text;
          } else if (e.type === 'prepend' && e.text) {
            text = e.text + text;
          }
        }
        const hash = await contentStoreDAO.store(text, art.mime_type);
        const rev = await artifactDAO.commit(art.artifact_id, hash, message || `manager edits (${edits.length})`, author || 'manager-agent', [art.current_revision]);
        return { success: true, action, artifactId: art.artifact_id, revisionId: rev.revision_id, reference: `ref:${hash.substring(0,12)}` };
      }

      if (action === 'finalize_to_task') {
        const { taskId } = context;
        if (!taskId) return { success: false, action, error: 'taskId is required' };
        const art = await artifactDAO.findByTaskId(taskId);
        if (!art) return { success: false, action, error: 'Artifact not found for task' };
        const rev = await artifactDAO.getRevision(art.current_revision);
        if (!rev) return { success: false, action, error: 'Current revision not found' };
        const text = (await contentStoreDAO.retrieveDecoded(rev.content_hash)) || '';

        const { getDAOs } = await import('../db/dao');
        const daos = getDAOs();
        await daos.tasks.updateResult(taskId, { text, artifactRef: `ref:${rev.content_hash.substring(0,12)}` });
        await daos.tasks.updateStatus(taskId, 'completed');
        return { success: true, action, artifactId: art.artifact_id, revisionId: art.current_revision };
      }

      return { success: false, action, error: 'Unknown action' };
    } catch (error) {
      return { success: false, action, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});

export default subtaskArtifactTool;
