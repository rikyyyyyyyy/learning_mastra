import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';

// Artifact Store Tool - 成果物の保存・取得・共有管理
export const artifactStoreTool = createTool({
  id: 'artifact-store',
  description: 'Store, retrieve, and share task artifacts across agent networks',
  inputSchema: z.object({
    action: z.enum(['store', 'retrieve', 'list_by_task', 'list_public', 'update', 'search']),
    artifactId: z.string().optional().describe('Artifact ID for operations that require it'),
    taskId: z.string().optional().describe('Task ID for storing or listing artifacts'),
    artifactData: z.object({
      artifactType: z.string().optional().describe('Type of artifact (html, json, text, etc.)'),
      content: z.string().optional().describe('The artifact content'),
      metadata: z.record(z.any()).optional().describe('Additional metadata'),
      isPublic: z.boolean().default(true).describe('Whether artifact is accessible to other networks'),
    }).optional().describe('Data for storing a new artifact'),
    searchCriteria: z.object({
      artifactType: z.string().optional(),
      taskType: z.string().optional(),
      limit: z.number().default(10),
    }).optional().describe('Criteria for searching artifacts'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    artifactId: z.string().optional(),
    artifact: z.any().optional(),
    artifacts: z.array(z.any()).optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    
    try {
      const { action, artifactId, taskId, artifactData, searchCriteria } = context;
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Artifact Store Tool approaching timeout limit');
      }

      switch (action) {
        case 'store': {
          if (!taskId || !artifactData?.artifactType || !artifactData?.content) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, artifactType, content',
            };
          }

          // Verify task exists
          const task = await daos.tasks.findById(taskId);
          if (!task) {
            return {
              success: false,
              action,
              error: `Task ${taskId} not found`,
            };
          }

          const newArtifactId = artifactId || `artifact-${taskId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          
          const newArtifact = await daos.artifacts.create({
            artifact_id: newArtifactId,
            task_id: taskId,
            artifact_type: artifactData.artifactType,
            content: artifactData.content,
            metadata: artifactData.metadata,
            is_public: artifactData.isPublic,
          });

          return {
            success: true,
            action,
            artifactId: newArtifactId,
            artifact: {
              artifactId: newArtifact.artifact_id,
              taskId: newArtifact.task_id,
              type: newArtifact.artifact_type,
              isPublic: newArtifact.is_public,
              createdAt: newArtifact.created_at,
            },
            message: `Artifact stored successfully with ID: ${newArtifactId}`,
          };
        }

        case 'retrieve': {
          if (!artifactId) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactId',
            };
          }

          const artifact = await daos.artifacts.findById(artifactId);
          
          if (!artifact) {
            return {
              success: false,
              action,
              artifactId,
              error: `Artifact ${artifactId} not found`,
            };
          }

          // Check if artifact is public or belongs to requesting task
          // Note: In a real implementation, we'd check the requesting agent's task context
          
          return {
            success: true,
            action,
            artifactId,
            artifact: {
              artifactId: artifact.artifact_id,
              taskId: artifact.task_id,
              type: artifact.artifact_type,
              content: artifact.content,
              metadata: artifact.metadata,
              isPublic: artifact.is_public,
              createdAt: artifact.created_at,
            },
            message: `Retrieved artifact ${artifactId}`,
          };
        }

        case 'list_by_task': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          const artifacts = await daos.artifacts.findByTaskId(taskId);
          
          return {
            success: true,
            action,
            artifacts: artifacts.map(a => ({
              artifactId: a.artifact_id,
              type: a.artifact_type,
              isPublic: a.is_public,
              createdAt: a.created_at,
              contentLength: a.content.length,
            })),
            message: `Found ${artifacts.length} artifacts for task ${taskId}`,
          };
        }

        case 'list_public': {
          const artifactType = searchCriteria?.artifactType;
          
          if (!artifactType) {
            return {
              success: false,
              action,
              error: 'Missing required field: artifactType in searchCriteria',
            };
          }

          const artifacts = await daos.artifacts.findPublicByType(artifactType);
          const limitedArtifacts = artifacts.slice(0, searchCriteria?.limit || 10);
          
          return {
            success: true,
            action,
            artifacts: limitedArtifacts.map(a => ({
              artifactId: a.artifact_id,
              taskId: a.task_id,
              type: a.artifact_type,
              createdAt: a.created_at,
              metadata: a.metadata,
            })),
            message: `Found ${limitedArtifacts.length} public artifacts of type ${artifactType}`,
          };
        }

        case 'update': {
          if (!artifactId || !artifactData?.content) {
            return {
              success: false,
              action,
              error: 'Missing required fields: artifactId, content',
            };
          }

          // Verify artifact exists
          const artifact = await daos.artifacts.findById(artifactId);
          if (!artifact) {
            return {
              success: false,
              action,
              error: `Artifact ${artifactId} not found`,
            };
          }

          await daos.artifacts.updateContent(artifactId, artifactData.content);

          return {
            success: true,
            action,
            artifactId,
            message: `Artifact ${artifactId} updated successfully`,
          };
        }

        case 'search': {
          // Simple search implementation - can be enhanced with more sophisticated queries
          const artifactType = searchCriteria?.artifactType;
          
          if (artifactType) {
            const artifacts = await daos.artifacts.findPublicByType(artifactType);
            const limitedArtifacts = artifacts.slice(0, searchCriteria?.limit || 10);
            
            return {
              success: true,
              action,
              artifacts: limitedArtifacts.map(a => ({
                artifactId: a.artifact_id,
                taskId: a.task_id,
                type: a.artifact_type,
                createdAt: a.created_at,
                metadata: a.metadata,
              })),
              message: `Found ${limitedArtifacts.length} artifacts matching search criteria`,
            };
          }

          return {
            success: false,
            action,
            error: 'Search requires at least artifactType in searchCriteria',
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
      console.error('Artifact Store Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});