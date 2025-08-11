import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';

/**
 * CEOエージェント専用ツール
 * ネットワークの方針を保存・更新
 */
export const policyManagementTool = createTool({
  id: 'policy-management',
  description: 'Save or update the strategic policy for the network task (CEO Agent only)',
  inputSchema: z.object({
    action: z.enum(['save_policy', 'update_policy']).describe('Action to perform'),
    networkId: z.string().describe('Network ID (same as jobId)'),
    policy: z.object({
      strategy: z.string().describe('Overall strategic approach'),
      priorities: z.array(z.string()).describe('Key priorities'),
      successCriteria: z.array(z.string()).describe('Success criteria'),
      qualityStandards: z.array(z.string()).describe('Quality standards'),
      outputRequirements: z.object({
        format: z.string().optional(),
        structure: z.string().optional(),
        specificRequirements: z.array(z.string()).optional(),
      }).optional(),
      resourcesNeeded: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      additionalNotes: z.string().optional(),
    }).describe('Strategic policy details'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    networkId: z.string(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { action, networkId, policy } = context;
    
    try {
      const daos = getDAOs();
      
      // メインタスクを取得
      const mainTask = await daos.tasks.findById(networkId);
      
      if (!mainTask) {
        // メインタスクが存在しない場合はエラー
        return {
          success: false,
          action,
          networkId,
          message: `Network main task ${networkId} not found. Cannot save policy.`,
        };
      }
      
      // 現在のメタデータを取得
      const currentMetadata = mainTask.metadata || {};
      
      // 方針データをメタデータに追加
      const updatedMetadata = {
        ...currentMetadata,
        isNetworkMainTask: true,
        policy: {
          ...policy,
          createdAt: action === 'save_policy' ? new Date().toISOString() : currentMetadata.policy?.createdAt,
          updatedAt: new Date().toISOString(),
          version: action === 'update_policy' ? (currentMetadata.policy?.version || 0) + 1 : 1,
        },
      };
      
      // メインタスクのメタデータを更新
      await daos.tasks.updateMetadata(networkId, updatedMetadata);
      
      console.log(`✅ ネットワーク方針を${action === 'save_policy' ? '保存' : '更新'}しました:`, {
        networkId,
        action,
        policyVersion: updatedMetadata.policy.version,
      });
      
      return {
        success: true,
        action,
        networkId,
        message: `Policy ${action === 'save_policy' ? 'saved' : 'updated'} successfully for network ${networkId}`,
      };
    } catch (error) {
      console.error('❌ 方針管理エラー:', error);
      return {
        success: false,
        action,
        networkId,
        message: `Failed to ${action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

/**
 * Manager用の方針確認機能（既存のtask-management-toolに統合可能）
 */
export const policyCheckTool = createTool({
  id: 'policy-check',
  description: 'Check if a strategic policy has been set for the network (Manager Agent)',
  inputSchema: z.object({
    networkId: z.string().describe('Network ID to check policy for'),
  }),
  outputSchema: z.object({
    hasPolicySet: z.boolean(),
    policy: z.any().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { networkId } = context;
    
    try {
      const daos = getDAOs();
      
      // メインタスクを取得
      const mainTask = await daos.tasks.findById(networkId);
      
      if (!mainTask) {
        return {
          hasPolicySet: false,
          message: `Network ${networkId} not found`,
        };
      }
      
      // メタデータから方針を確認
      const policy = mainTask.metadata?.policy;
      
      if (policy) {
        return {
          hasPolicySet: true,
          policy: policy,
          message: `Policy found for network ${networkId} (version ${policy.version})`,
        };
      } else {
        return {
          hasPolicySet: false,
          message: `No policy set for network ${networkId}. CEO decision required.`,
        };
      }
    } catch (error) {
      console.error('❌ 方針確認エラー:', error);
      return {
        hasPolicySet: false,
        message: `Error checking policy: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});