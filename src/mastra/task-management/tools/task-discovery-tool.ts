import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDAOs } from '../db/dao';
import { DependencyType } from '../db/schema';

// Task Discovery Tool - 関連タスクの検索と依存関係の管理
export const taskDiscoveryTool = createTool({
  id: 'task-discovery',
  description: 'Discover related tasks, manage dependencies, and find available resources across agent networks',
  inputSchema: z.object({
    action: z.enum(['find_related', 'add_dependency', 'check_dependencies', 'find_by_type', 'find_by_creator', 'get_network_status']),
    taskId: z.string().optional().describe('Task ID for dependency operations'),
    dependency: z.object({
      dependsOnTaskId: z.string(),
      dependencyType: DependencyType,
    }).optional().describe('Dependency information'),
    searchCriteria: z.object({
      taskType: z.string().optional(),
      createdBy: z.string().optional(),
      status: z.string().optional(),
      hasArtifacts: z.boolean().optional(),
      limit: z.number().default(20),
    }).optional().describe('Criteria for searching tasks'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    tasks: z.array(z.any()).optional(),
    dependencies: z.array(z.any()).optional(),
    dependenciesSatisfied: z.boolean().optional(),
    networkStatus: z.any().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    
    try {
      const { action, taskId, dependency, searchCriteria } = context;
      const daos = getDAOs();
      
      // Ensure response time < 100ms
      if (Date.now() - startTime > 80) {
        console.warn('⚠️ Task Discovery Tool approaching timeout limit');
      }

      switch (action) {
        case 'find_related': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          // Get the current task
          const currentTask = await daos.tasks.findById(taskId);
          if (!currentTask) {
            return {
              success: false,
              action,
              error: `Task ${taskId} not found`,
            };
          }

          // Find tasks with the same type or created by the same agent
          const relatedByType = currentTask.task_type ? 
            await daos.tasks.findByStatus('running') : [];
          const relatedByCreator = await daos.tasks.findByCreator(currentTask.created_by);

          // Combine and deduplicate
          const relatedTasksMap = new Map();
          [...relatedByType, ...relatedByCreator].forEach(task => {
            if (task.task_id !== taskId) {
              relatedTasksMap.set(task.task_id, task);
            }
          });

          const relatedTasks = Array.from(relatedTasksMap.values())
            .slice(0, searchCriteria?.limit || 20);

          // Get artifacts for related tasks
          const tasksWithArtifacts = await Promise.all(
            relatedTasks.map(async (task) => {
              const artifacts = await daos.artifacts.findByTaskId(task.task_id);
              return {
                taskId: task.task_id,
                taskType: task.task_type,
                status: task.status,
                createdBy: task.created_by,
                createdAt: task.created_at,
                artifactCount: artifacts.length,
                publicArtifacts: artifacts.filter(a => a.is_public).length,
              };
            })
          );

          return {
            success: true,
            action,
            tasks: tasksWithArtifacts,
            message: `Found ${tasksWithArtifacts.length} related tasks`,
          };
        }

        case 'add_dependency': {
          if (!taskId || !dependency?.dependsOnTaskId) {
            return {
              success: false,
              action,
              error: 'Missing required fields: taskId, dependency.dependsOnTaskId',
            };
          }

          // Verify both tasks exist
          const task = await daos.tasks.findById(taskId);
          const dependsOnTask = await daos.tasks.findById(dependency.dependsOnTaskId);
          
          if (!task || !dependsOnTask) {
            return {
              success: false,
              action,
              error: 'One or both tasks not found',
            };
          }

          const dependencyId = `dep-${taskId}-${dependency.dependsOnTaskId}-${Date.now()}`;
          
          await daos.dependencies.create({
            dependency_id: dependencyId,
            task_id: taskId,
            depends_on_task_id: dependency.dependsOnTaskId,
            dependency_type: dependency.dependencyType,
          });

          return {
            success: true,
            action,
            message: `Dependency added: ${taskId} depends on ${dependency.dependsOnTaskId}`,
          };
        }

        case 'check_dependencies': {
          if (!taskId) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskId',
            };
          }

          const dependencies = await daos.dependencies.findByTaskId(taskId);
          const satisfied = await daos.dependencies.checkDependenciesSatisfied(taskId);

          // Get status of each dependency
          const dependencyStatuses = await Promise.all(
            dependencies.map(async (dep) => {
              const task = await daos.tasks.findById(dep.depends_on_task_id);
              return {
                dependencyId: dep.dependency_id,
                dependsOnTaskId: dep.depends_on_task_id,
                dependencyType: dep.dependency_type,
                taskStatus: task?.status || 'unknown',
                isSatisfied: dep.dependency_type === 'requires_completion' ? 
                  task?.status === 'completed' : true,
              };
            })
          );

          return {
            success: true,
            action,
            dependencies: dependencyStatuses,
            dependenciesSatisfied: satisfied,
            message: `Task has ${dependencies.length} dependencies, ${satisfied ? 'all satisfied' : 'some pending'}`,
          };
        }

        case 'find_by_type': {
          const taskType = searchCriteria?.taskType;
          if (!taskType) {
            return {
              success: false,
              action,
              error: 'Missing required field: taskType in searchCriteria',
            };
          }

          const allTasks = await daos.tasks.findRunningTasks();
          const filteredTasks = allTasks
            .filter(t => t.task_type === taskType)
            .slice(0, searchCriteria?.limit || 20);

          return {
            success: true,
            action,
            tasks: filteredTasks.map(t => ({
              taskId: t.task_id,
              status: t.status,
              createdBy: t.created_by,
              priority: t.priority,
              createdAt: t.created_at,
            })),
            message: `Found ${filteredTasks.length} tasks of type ${taskType}`,
          };
        }

        case 'find_by_creator': {
          const createdBy = searchCriteria?.createdBy;
          if (!createdBy) {
            return {
              success: false,
              action,
              error: 'Missing required field: createdBy in searchCriteria',
            };
          }

          const tasks = await daos.tasks.findByCreator(createdBy);
          const limitedTasks = tasks.slice(0, searchCriteria?.limit || 20);

          return {
            success: true,
            action,
            tasks: limitedTasks.map(t => ({
              taskId: t.task_id,
              taskType: t.task_type,
              status: t.status,
              priority: t.priority,
              createdAt: t.created_at,
            })),
            message: `Found ${limitedTasks.length} tasks created by ${createdBy}`,
          };
        }

        case 'get_network_status': {
          // Get overall network status
          const allTasks = await daos.tasks.findRunningTasks();
          
          // Group by status
          const statusCounts = allTasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          // Group by type
          const typeCounts = allTasks.reduce((acc, task) => {
            acc[task.task_type] = (acc[task.task_type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          // Get recent high-priority tasks
          const highPriorityTasks = allTasks
            .filter(t => t.priority === 'high')
            .slice(0, 5)
            .map(t => ({
              taskId: t.task_id,
              taskType: t.task_type,
              status: t.status,
              createdBy: t.created_by,
            }));

          return {
            success: true,
            action,
            networkStatus: {
              totalActiveTasks: allTasks.length,
              statusBreakdown: statusCounts,
              typeBreakdown: typeCounts,
              highPriorityTasks,
            },
            message: `Network has ${allTasks.length} active tasks`,
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
      console.error('Task Discovery Tool error:', error);
      return {
        success: false,
        action: context.action,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },
});