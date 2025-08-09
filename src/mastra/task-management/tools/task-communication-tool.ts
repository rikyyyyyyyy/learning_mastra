import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
import { MessageType } from '../db/schema';

// Task Communication Tool - タスク間メッセージングと追加指示の送受信
export const taskCommunicationTool = createTool({
  id: 'task-communication',
  description: 'Send messages, instructions, and updates between tasks in different agent networks',
  inputSchema: z.object({
    action: z.enum(['send', 'receive', 'receive_unread', 'mark_read', 'broadcast']),
    messageData: z.object({
      fromTaskId: z.string().optional().describe('Sending task ID'),
      toTaskId: z.string().optional().describe('Receiving task ID'),
      fromAgentId: z.string().describe('ID of the sending agent'),
      messageType: MessageType.describe('Type of message'),
      content: z.string().describe('Message content'),
    }).optional().describe('Data for sending a message'),
    taskId: z.string().optional().describe('Task ID for receiving messages'),
    messageId: z.string().optional().describe('Message ID for marking as read'),
    broadcastCriteria: z.object({
      taskType: z.string().optional(),
      status: z.string().optional(),
      excludeTaskId: z.string().optional(),
    }).optional().describe('Criteria for broadcasting messages'),
    limit: z.number().default(20).describe('Maximum number of messages to retrieve'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    messageId: z.string().optional(),
    messages: z.array(z.any()).optional(),
    sentCount: z.number().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    
    try {
      const { action, messageData, taskId, messageId, broadcastCriteria, limit } = context;
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Task Communication Tool approaching timeout limit');
      }

      switch (action) {
        case 'send': {
          if (!messageData?.toTaskId || !messageData?.fromAgentId || !messageData?.content) {
            return {
              success: false,
              action,
              error: 'Missing required fields: toTaskId, fromAgentId, content',
            };
          }

          // Verify target task exists
          const targetTask = await daos.tasks.findById(messageData.toTaskId);
          if (!targetTask) {
            return {
              success: false,
              action,
              error: `Target task ${messageData.toTaskId} not found`,
            };
          }

          const newMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          
          await daos.communications.create({
            message_id: newMessageId,
            from_task_id: messageData.fromTaskId,
            to_task_id: messageData.toTaskId,
            from_agent_id: messageData.fromAgentId,
            message_type: messageData.messageType,
            content: messageData.content,
          });

          return {
            success: true,
            action,
            messageId: newMessageId,
            message: `Message sent successfully to task ${messageData.toTaskId}`,
          };
        }

        case 'receive': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          const messages = await daos.communications.findByTaskId(taskId, limit);
          
          return {
            success: true,
            action,
            messages: messages.map(m => ({
              messageId: m.message_id,
              fromTaskId: m.from_task_id,
              fromAgentId: m.from_agent_id,
              messageType: m.message_type,
              content: m.content,
              createdAt: m.created_at,
              isRead: !!m.read_at,
            })),
            message: `Retrieved ${messages.length} messages for task ${taskId}`,
          };
        }

        case 'receive_unread': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          const unreadMessages = await daos.communications.findUnreadByTaskId(taskId);
          
          // Optionally mark them as read immediately
          if (unreadMessages.length > 0) {
            // Mark all as read in background to not block response
            setTimeout(async () => {
              try {
                await daos.communications.markAllAsReadForTask(taskId);
              } catch (e) {
                console.error('Failed to mark messages as read:', e);
              }
            }, 0);
          }
          
          return {
            success: true,
            action,
            messages: unreadMessages.map(m => ({
              messageId: m.message_id,
              fromTaskId: m.from_task_id,
              fromAgentId: m.from_agent_id,
              messageType: m.message_type,
              content: m.content,
              createdAt: m.created_at,
            })),
            message: `Retrieved ${unreadMessages.length} unread messages for task ${taskId}`,
          };
        }

        case 'mark_read': {
          if (!messageId) {
            return {
              success: false,
              action,
              error: 'Missing required field: messageId',
            };
          }

          await daos.communications.markAsRead(messageId);
          
          return {
            success: true,
            action,
            messageId,
            message: `Message ${messageId} marked as read`,
          };
        }

        case 'broadcast': {
          if (!messageData?.fromAgentId || !messageData?.content) {
            return {
              success: false,
              action,
              error: 'Missing required fields: fromAgentId, content in messageData',
            };
          }

          // Find tasks matching broadcast criteria
          let targetTasks = await daos.tasks.findRunningTasks();
          
          // Apply filters
          if (broadcastCriteria?.taskType) {
            targetTasks = targetTasks.filter(t => t.task_type === broadcastCriteria.taskType);
          }
          if (broadcastCriteria?.status) {
            targetTasks = targetTasks.filter(t => t.status === broadcastCriteria.status);
          }
          if (broadcastCriteria?.excludeTaskId) {
            targetTasks = targetTasks.filter(t => t.task_id !== broadcastCriteria.excludeTaskId);
          }

          // Send messages to all matching tasks
          let sentCount = 0;
          for (const task of targetTasks) {
            const msgId = `msg-broadcast-${Date.now()}-${sentCount}-${Math.random().toString(36).substring(2, 8)}`;
            
            await daos.communications.create({
              message_id: msgId,
              from_task_id: messageData.fromTaskId,
              to_task_id: task.task_id,
              from_agent_id: messageData.fromAgentId,
              message_type: messageData.messageType || 'update',
              content: messageData.content,
            });
            
            sentCount++;
          }
          
          return {
            success: true,
            action,
            sentCount,
            message: `Broadcast sent to ${sentCount} tasks`,
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
      console.error('Task Communication Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});