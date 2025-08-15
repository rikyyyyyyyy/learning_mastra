// 既存ツールをレジストリにまとめ、役割ごとの注入選択を容易にする
import { agentNetworkTool } from '../tools/agent-network-tool';
import { slidePreviewTool } from '../tools/slide-preview-tool';
import { jobStatusTool } from '../tools/job-status-tool';
import { jobResultTool } from '../tools/job-result-tool';
// Task management tools
import { taskRegistryTool } from '../task-management/tools/task-registry-tool';
import { directiveManagementTool } from '../task-management/tools/directive-management-tool';
import { taskManagementTool } from '../task-management/tools/task-management-tool';
import { batchTaskCreationTool } from '../task-management/tools/batch-task-creation-tool';
import { policyCheckTool } from '../task-management/tools/policy-management-tool';
import { policyManagementTool } from '../task-management/tools/policy-management-tool';
import { taskViewerTool } from '../task-management/tools/task-viewer-tool';
import { finalResultTool } from '../task-management/tools/final-result-tool';
// Worker向け
import { exaMCPSearchTool } from '../tools/exa-search-wrapper';
import { docsReaderTool } from '../tools/docs-reader-tool';

export type ToolId = keyof typeof toolRegistry;

export const toolRegistry = {
  agentNetworkTool,
  slidePreviewTool,
  jobStatusTool,
  jobResultTool,
  taskRegistryTool,
  directiveManagementTool,
  taskManagementTool,
  batchTaskCreationTool,
  policyCheckTool,
  policyManagementTool,
  taskViewerTool,
  finalResultTool,
  exaMCPSearchTool,
  docsReaderTool,
};

export type AgentRole = 'GENERAL' | 'CEO' | 'MANAGER' | 'WORKER';

// 役割ごとの既定ツールセット（将来はDB上書き可）
export function getToolsForRole(role: AgentRole): Record<string, unknown> {
  // TODO: 将来ここで agent_definitions を参照して tools を上書き
  switch (role) {
    case 'GENERAL':
      return {
        agentNetworkTool,
        slidePreviewTool,
        jobStatusTool,
        jobResultTool,
        taskRegistryTool,
        directiveManagementTool,
        docsReaderTool,
      };
    case 'CEO':
      return {
        taskViewerTool,
        policyManagementTool,
        finalResultTool,
        docsReaderTool,
      };
    case 'MANAGER':
      return {
        taskManagementTool,
        batchTaskCreationTool,
        directiveManagementTool,
        policyCheckTool,
        docsReaderTool,
      };
    case 'WORKER':
      return {
        exaMCPSearchTool,
        docsReaderTool,
      };
    default:
      return {};
  }
}

