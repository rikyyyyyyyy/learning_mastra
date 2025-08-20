import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';

// Directive Management Tool - 追加指令の管理ツール
export const directiveManagementTool = createTool({
  id: 'directive-management',
  description: 'Manage additional directives from general agent - check, acknowledge, apply directives',
  inputSchema: z.object({
    action: z.enum([
      'create_directive',
      'check_directives',
      'get_directive',
      'acknowledge_directive',
      'apply_directive',
      'reject_directive',
      'has_pending_directives',
    ]),
    networkId: z.string().describe('Network ID for the agent network'),
    directiveId: z.string().optional().describe('Directive ID for operations that require it'),
    directiveData: z.object({
      content: z.string().describe('The directive content'),
      type: z.enum(['policy_update', 'task_addition', 'priority_change', 'abort', 'other']).default('other'),
      source: z.string().default('general-agent'),
      metadata: z.record(z.any()).optional(),
    }).optional().describe('Data for creating a new directive'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    directiveId: z.string().optional(),
    directive: z.any().optional(),
    directives: z.array(z.any()).optional(),
    hasPending: z.boolean().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    
    try {
      const { action, networkId, directiveId, directiveData } = context;
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Directive Management Tool approaching timeout limit');
      }

      switch (action) {
        case 'create_directive': {
          if (!directiveData?.content) {
            return {
              success: false,
              action,
              error: 'Missing required field: content',
            };
          }

          const newDirectiveId = directiveId || `directive-${networkId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          
          const newDirective = await daos.directives.create({
            directive_id: newDirectiveId,
            network_id: networkId,
            directive_content: directiveData.content,
            directive_type: directiveData.type,
            source: directiveData.source,
            status: 'pending',
            metadata: directiveData.metadata,
          });

          return {
            success: true,
            action,
            directiveId: newDirectiveId,
            directive: newDirective,
            message: `Directive created successfully with ID: ${newDirectiveId}`,
          };
        }

        case 'check_directives': {
          const pendingDirectives = await daos.directives.findPendingByNetworkId(networkId);
          
          return {
            success: true,
            action,
            directives: pendingDirectives.map(d => ({
              directiveId: d.directive_id,
              content: d.directive_content,
              type: d.directive_type,
              source: d.source,
              status: d.status,
              createdAt: d.created_at,
            })),
            hasPending: pendingDirectives.length > 0,
            message: `Found ${pendingDirectives.length} pending directives for network ${networkId}`,
          };
        }

        case 'get_directive': {
          if (!directiveId) {
            return {
              success: false,
              action,
              error: 'Missing required field: directiveId',
            };
          }

          const directive = await daos.directives.findById(directiveId);
          
          if (!directive) {
            return {
              success: false,
              action,
              directiveId,
              error: `Directive ${directiveId} not found`,
            };
          }

          return {
            success: true,
            action,
            directiveId,
            directive,
            message: `Retrieved directive ${directiveId}`,
          };
        }

        case 'acknowledge_directive': {
          if (!directiveId) {
            return {
              success: false,
              action,
              error: 'Missing required field: directiveId',
            };
          }

          await daos.directives.acknowledge(directiveId);

          return {
            success: true,
            action,
            directiveId,
            message: `Directive ${directiveId} acknowledged`,
          };
        }

        case 'apply_directive': {
          if (!directiveId) {
            return {
              success: false,
              action,
              error: 'Missing required field: directiveId',
            };
          }

          await daos.directives.apply(directiveId);

          return {
            success: true,
            action,
            directiveId,
            message: `Directive ${directiveId} applied`,
          };
        }

        case 'reject_directive': {
          if (!directiveId) {
            return {
              success: false,
              action,
              error: 'Missing required field: directiveId',
            };
          }

          await daos.directives.reject(directiveId);

          return {
            success: true,
            action,
            directiveId,
            message: `Directive ${directiveId} rejected`,
          };
        }

        case 'has_pending_directives': {
          const hasPending = await daos.directives.hasUnacknowledgedDirectives(networkId);
          
          return {
            success: true,
            action,
            hasPending,
            message: hasPending 
              ? `Network ${networkId} has pending directives` 
              : `Network ${networkId} has no pending directives`,
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
      console.error('Directive Management Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});