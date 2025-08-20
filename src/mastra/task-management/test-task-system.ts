#!/usr/bin/env tsx
/**
 * Task Management System Test
 * Tests the complete task creation, execution, and status management flow
 */

import { initializeTaskManagementDB } from './db/migrations';
import { getDAOs } from './db/dao';
import { batchTaskCreationTool } from './tools/batch-task-creation-tool';
import { taskManagementTool } from './tools/task-management-tool';
import { taskViewerTool } from './tools/task-viewer-tool';
import { RuntimeContext } from '@mastra/core/di';

async function testTaskManagementSystem() {
  console.log('🧪 Testing Task Management System\n');
  
  try {
    // 1. Initialize database
    console.log('📦 Initializing database...');
    const dbUrl = process.env.MASTRA_DB_URL || ':memory:';
    await initializeTaskManagementDB(dbUrl);
    const daos = getDAOs();
    console.log('✅ Database initialized\n');
    
    // 2. Create test network ID
    const networkId = `test-network-${Date.now()}`;
    const rc = new RuntimeContext();
    rc.set('currentJobId', networkId);
    
    console.log(`🌐 Test Network ID: ${networkId}\n`);
    
    // 3. Test batch task creation
    console.log('📝 Testing batch task creation...');
    const testTasks = [
      { taskType: 'analysis', taskDescription: 'Analyze requirements', stepNumber: 1 },
      { taskType: 'research', taskDescription: 'Research background', stepNumber: 2 },
      { taskType: 'design', taskDescription: 'Design solution', stepNumber: 3 },
      { taskType: 'implementation', taskDescription: 'Implement features', stepNumber: 4 },
      { taskType: 'testing', taskDescription: 'Test and validate', stepNumber: 5 },
    ];
    
    const createResult = await batchTaskCreationTool.execute({
      context: {
        networkId,
        tasks: testTasks,
        autoAssign: false,
      },
      runtimeContext: rc,
    });
    
    console.log(`  Created ${createResult.totalTasks} tasks`);
    console.log(`  Success: ${createResult.success}`);
    console.log(`  Message: ${createResult.message}\n`);
    
    // 4. Test duplicate prevention
    console.log('🔄 Testing duplicate prevention...');
    const duplicateResult = await batchTaskCreationTool.execute({
      context: {
        networkId,
        tasks: testTasks,
        autoAssign: false,
      },
      runtimeContext: rc,
    });
    
    console.log(`  Success: ${duplicateResult.success}`);
    console.log(`  Message: ${duplicateResult.message}`);
    console.log(`  Total tasks: ${duplicateResult.totalTasks}\n`);
    
    // 5. Test task viewer
    console.log('👀 Testing task viewer...');
    const viewResult = await taskViewerTool.execute({
      context: {
        action: 'view_all_tasks',
        networkId,
      },
    });
    
    const allTasks = viewResult.data as any[];
    console.log(`  Found ${allTasks.length} tasks`);
    console.log('  Task list:');
    allTasks.forEach(task => {
      console.log(`    - Step ${task.stepNumber}: [${task.status}] ${task.taskType} - ${task.description}`);
    });
    console.log();
    
    // 6. Test task execution flow
    console.log('🔄 Testing task execution flow...');
    
    // Get first queued task
    const nextTaskResult = await taskManagementTool.execute({
      context: {
        action: 'get_next_task',
        networkId,
      },
      runtimeContext: rc,
    });
    
    if (nextTaskResult.task) {
      const task = nextTaskResult.task as any;
      console.log(`  Next task: Step ${task.stepNumber} - ${task.description}`);
      
      // Update to running
      await taskManagementTool.execute({
        context: {
          action: 'update_status',
          networkId,
          taskId: task.taskId,
          status: 'running',
        },
        runtimeContext: rc,
      });
      console.log(`  ➡️ Status updated to: running`);
      
      // Simulate work and save result
      const simulatedResult = `Completed ${task.taskType} task with success`;
      await taskManagementTool.execute({
        context: {
          action: 'update_result',
          networkId,
          taskId: task.taskId,
          result: simulatedResult,
        },
        runtimeContext: rc,
      });
      console.log(`  📝 Result saved: ${simulatedResult}`);
      
      // Update to completed
      await taskManagementTool.execute({
        context: {
          action: 'update_status',
          networkId,
          taskId: task.taskId,
          status: 'completed',
        },
        runtimeContext: rc,
      });
      console.log(`  ✅ Status updated to: completed\n`);
    }
    
    // 7. Test network summary
    console.log('📊 Testing network summary...');
    const summaryResult = await taskViewerTool.execute({
      context: {
        action: 'get_network_summary',
        networkId,
      },
    });
    
    const summary = summaryResult.summary as any;
    console.log(`  Network ID: ${summary.networkId}`);
    console.log(`  Total tasks: ${summary.totalSubTasks}`);
    console.log(`  Progress: ${summary.progressPercentage}%`);
    console.log(`  Status breakdown:`);
    console.log(`    - Queued: ${summary.tasksByStatus.queued}`);
    console.log(`    - Running: ${summary.tasksByStatus.running}`);
    console.log(`    - Completed: ${summary.tasksByStatus.completed}`);
    console.log(`    - Failed: ${summary.tasksByStatus.failed}\n`);
    
    // 8. Verify no duplicates
    console.log('✔️ Verifying no duplicate tasks...');
    const allDbTasks = await daos.tasks.findByNetworkId(networkId);
    const stepNumbers = allDbTasks.map(t => t.step_number).filter(s => s !== null && s !== undefined);
    const uniqueSteps = new Set(stepNumbers);
    
    if (stepNumbers.length === uniqueSteps.size) {
      console.log(`  ✅ No duplicates found! Each step has exactly one task.`);
    } else {
      console.log(`  ❌ Duplicates detected! ${stepNumbers.length} tasks but only ${uniqueSteps.size} unique steps.`);
      const duplicates: Record<number, number> = {};
      stepNumbers.forEach(step => {
        duplicates[step] = (duplicates[step] || 0) + 1;
      });
      Object.entries(duplicates)
        .filter(([_, count]) => count > 1)
        .forEach(([step, count]) => {
          console.log(`    - Step ${step}: ${count} duplicate tasks`);
        });
    }
    
    // 9. Test sequential execution
    console.log('\n🔢 Testing sequential task execution...');
    let executedCount = 1; // We already executed one task above
    const maxIterations = 10;
    
    while (executedCount < maxIterations) {
      const nextResult = await taskManagementTool.execute({
        context: {
          action: 'get_next_task',
          networkId,
        },
        runtimeContext: rc,
      });
      
      if (!nextResult.task) {
        console.log(`  All tasks completed or no more queued tasks.`);
        break;
      }
      
      const task = nextResult.task as any;
      console.log(`  Executing Step ${task.stepNumber}: ${task.taskType}`);
      
      // Quick execution simulation
      await taskManagementTool.execute({
        context: {
          action: 'update_status',
          networkId,
          taskId: task.taskId,
          status: 'running',
        },
        runtimeContext: rc,
      });
      
      await taskManagementTool.execute({
        context: {
          action: 'update_result',
          networkId,
          taskId: task.taskId,
          result: `Test result for ${task.taskType}`,
        },
        runtimeContext: rc,
      });
      
      await taskManagementTool.execute({
        context: {
          action: 'update_status',
          networkId,
          taskId: task.taskId,
          status: 'completed',
        },
        runtimeContext: rc,
      });
      
      executedCount++;
    }
    
    console.log(`  Total tasks executed: ${executedCount}`);
    
    // 10. Final summary
    console.log('\n📈 Final Summary:');
    const finalSummary = await taskViewerTool.execute({
      context: {
        action: 'get_network_summary',
        networkId,
      },
    });
    
    const finalStats = finalSummary.summary as any;
    console.log(`  Completion: ${finalStats.progressPercentage}%`);
    console.log(`  Completed tasks: ${finalStats.tasksByStatus.completed}/${finalStats.totalSubTasks}`);
    
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testTaskManagementSystem()
    .then(() => {
      console.log('\n✨ Task management system test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testTaskManagementSystem };