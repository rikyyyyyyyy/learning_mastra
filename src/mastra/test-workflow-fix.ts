#!/usr/bin/env tsx
/**
 * Test script for verifying the CEO workflow fix
 */

import { initializeTaskManagementDB } from './task-management/db/migrations';
import { ceoManagerWorkerWorkflow } from './workflows/task-workflow-v2';
import { RuntimeContext } from '@mastra/core/di';

async function testWorkflowFix() {
  console.log('🧪 Testing CEO workflow fix...\n');
  
  try {
    // Initialize database
    console.log('📦 Initializing database...');
    const dbUrl = process.env.MASTRA_DB_URL || ':memory:';
    await initializeTaskManagementDB(dbUrl);
    console.log('✅ Database initialized\n');
    
    // Create test input
    const testInput = {
      jobId: `test-${Date.now()}`,
      taskType: 'web-search' as const,
      taskDescription: 'Test task for CEO workflow fix',
      taskParameters: {
        query: 'test query',
      },
      context: {
        priority: 'medium' as const,
        expectedOutput: 'Test output',
      },
    };
    
    console.log('🚀 Starting workflow execution...');
    console.log(`  Job ID: ${testInput.jobId}`);
    console.log(`  Task Type: ${testInput.taskType}`);
    console.log(`  Description: ${testInput.taskDescription}\n`);
    
    // Create runtime context
    const rc = new RuntimeContext();
    rc.set('selectedModel', 'claude-sonnet-4');
    rc.set('currentJobId', testInput.jobId);
    
    // Execute workflow
    const result = await ceoManagerWorkerWorkflow.execute({
      inputData: testInput,
      executionOptions: {
        runtimeContext: rc,
      },
    });
    
    console.log('\n📊 Workflow execution result:');
    console.log(`  Success: ${result.success || false}`);
    console.log(`  Message: ${result.message || 'No message'}`);
    
    if (result.success) {
      console.log('\n✅ Workflow executed successfully!');
      console.log('The CEO agent error has been fixed.');
    } else {
      console.log('\n❌ Workflow execution failed');
      console.log('Error details:', result);
    }
    
    return result.success;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    
    // Check if it's the specific CEO tool input error
    if (error instanceof Error && error.message.includes('Input should be a valid dictionary')) {
      console.error('\n⚠️ The CEO tool input error still exists!');
      console.error('Error message:', error.message);
    }
    
    return false;
  }
}

// Run the test
if (require.main === module) {
  testWorkflowFix()
    .then((success) => {
      if (success) {
        console.log('\n✨ Test completed successfully');
        process.exit(0);
      } else {
        console.log('\n💥 Test failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Test failed with error:', error);
      process.exit(1);
    });
}

export { testWorkflowFix };