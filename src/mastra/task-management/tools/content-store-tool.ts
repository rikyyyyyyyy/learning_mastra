import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { contentStoreDAO, artifactDAO } from '../db/cas-dao';

/**
 * Content-Addressable Storage Tool
 * コンテンツをハッシュベースで保存・取得
 */
export const contentStoreTool = createTool({
  id: 'content-store',
  description: 'Store and retrieve content using Content-Addressable Storage (CAS)',
  inputSchema: z.object({
    action: z.enum(['store', 'retrieve', 'get_reference', 'resolve_reference']),
    content: z.string().optional().describe('Content to store (for store action)'),
    contentType: z.string().optional().describe('MIME type of the content'),
    contentHash: z.string().optional().describe('Hash to retrieve content (for retrieve action)'),
    reference: z.string().optional().describe('Reference string like ref:abc123 (for resolve_reference)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    contentHash: z.string().optional(),
    reference: z.string().optional(),
    content: z.string().optional(),
    metadata: z.object({
      size: z.number(),
      type: z.string(),
      created: z.string(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { action, content, contentType, contentHash, reference } = context;
    
    try {
      switch (action) {
        case 'store': {
          if (!content || !contentType) {
            return {
              success: false,
              error: 'Missing required fields: content, contentType',
            };
          }
          
          const hash = await contentStoreDAO.store(content, contentType);
          const ref = `ref:${hash.substring(0, 12)}`;
          
          console.log(`📦 Content stored: ${ref} (${content.length} bytes)`);
          
          return {
            success: true,
            contentHash: hash,
            reference: ref,
            metadata: {
              size: Buffer.from(content, 'utf-8').length,
              type: contentType,
              created: new Date().toISOString(),
            },
          };
        }
        
        case 'retrieve': {
          if (!contentHash) {
            return {
              success: false,
              error: 'Missing required field: contentHash',
            };
          }
          
          const storedContent = await contentStoreDAO.retrieveDecoded(contentHash);
          if (!storedContent) {
            return {
              success: false,
              error: `Content not found: ${contentHash}`,
            };
          }
          
          const metadata = await contentStoreDAO.getMetadata(contentHash);
          
          return {
            success: true,
            contentHash,
            content: storedContent,
            metadata: metadata || undefined,
          };
        }
        
        case 'get_reference': {
          if (!contentHash) {
            return {
              success: false,
              error: 'Missing required field: contentHash',
            };
          }
          
          const ref = `ref:${contentHash.substring(0, 12)}`;
          
          return {
            success: true,
            contentHash,
            reference: ref,
          };
        }
        
        case 'resolve_reference': {
          if (!reference) {
            return {
              success: false,
              error: 'Missing required field: reference',
            };
          }
          
          // ref:abc123... 形式から実際のハッシュを解決
          const hashPrefix = reference.replace('ref:', '');
          
          // 前方一致でハッシュを検索（簡易実装）
          // 本番環境では専用のインデックステーブルを使用
          const storedContent = await contentStoreDAO.retrieveDecoded(hashPrefix);
          
          if (!storedContent) {
            return {
              success: false,
              error: `Reference not found: ${reference}`,
            };
          }
          
          return {
            success: true,
            reference,
            content: storedContent,
          };
        }
        
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      console.error('Content Store Tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});