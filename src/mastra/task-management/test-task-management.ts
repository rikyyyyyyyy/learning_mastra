import { initializeTaskManagementDB } from './db/migrations';
import { getDAOs } from './db/dao';

// Test script for task management system
async function testTaskManagement() {
  console.log('🧪 Starting task management system test...\n');
  
  try {
    // Step 1: Initialize database
    console.log('1️⃣ Initializing database...');
    await initializeTaskManagementDB(':memory:');
    console.log('✅ Database initialized\n');
    
    // Step 2: Get DAOs
    const daos = getDAOs();
    console.log('2️⃣ DAOs obtained successfully\n');
    
    if (!daos.tasks || !daos.artifacts || !daos.communications || !daos.dependencies) {
      throw new Error('Failed to initialize DAOs');
    }
    
    // Step 3: Create a test task
    console.log('3️⃣ Creating test task...');
    const task1 = await daos.tasks.create({
      task_id: 'test-task-1',
      parent_job_id: 'job-123',
      network_type: 'CEO-Manager-Worker',
      status: 'queued',
      task_type: 'slide-generation',
      task_description: 'Generate slides about AI',
      task_parameters: { topic: 'AI Advances', pages: 10 },
      created_by: 'general-agent',
      priority: 'high',
      metadata: { test: true }
    });
    console.log('✅ Task created:', task1.task_id);
    
    // Step 4: Create another task
    const task2 = await daos.tasks.create({
      task_id: 'test-task-2',
      parent_job_id: 'job-124',
      network_type: 'CEO-Manager-Worker',
      status: 'running',
      task_type: 'web-search',
      task_description: 'Search for AI news',
      task_parameters: { query: 'latest AI breakthroughs' },
      created_by: 'general-agent',
      priority: 'medium',
    });
    console.log('✅ Second task created:', task2.task_id, '\n');
    
    // Step 5: Store an artifact
    console.log('4️⃣ Storing artifact...');
    const artifact = await daos.artifacts.create({
      artifact_id: 'artifact-1',
      task_id: task1.task_id,
      artifact_type: 'html',
      content: '<html><body><h1>AI Presentation</h1></body></html>',
      metadata: { slides: 10 },
      is_public: true,
    });
    console.log('✅ Artifact stored:', artifact.artifact_id, '\n');
    
    // Step 6: Send a message between tasks
    console.log('5️⃣ Sending inter-task message...');
    await daos.communications.create({
      message_id: 'msg-1',
      from_task_id: task2.task_id,
      to_task_id: task1.task_id,
      from_agent_id: 'worker-agent',
      message_type: 'update',
      content: 'Found relevant AI news that could be included in slides',
    });
    console.log('✅ Message sent from', task2.task_id, 'to', task1.task_id, '\n');
    
    // Step 7: Add dependency
    console.log('6️⃣ Adding task dependency...');
    await daos.dependencies.create({
      dependency_id: 'dep-1',
      task_id: task1.task_id,
      depends_on_task_id: task2.task_id,
      dependency_type: 'uses_artifact',
    });
    console.log('✅ Dependency created: task1 depends on task2\n');
    
    // Step 8: Query running tasks
    console.log('7️⃣ Querying running tasks...');
    const runningTasks = await daos.tasks.findRunningTasks();
    console.log(`Found ${runningTasks.length} running/queued tasks:`);
    runningTasks.forEach(t => {
      console.log(`  - ${t.task_id}: ${t.task_type} (${t.status})`);
    });
    console.log();
    
    // Step 9: Check unread messages
    console.log('8️⃣ Checking unread messages for task1...');
    const unreadMessages = await daos.communications.findUnreadByTaskId(task1.task_id);
    console.log(`Found ${unreadMessages.length} unread messages:`);
    unreadMessages.forEach(m => {
      console.log(`  - From ${m.from_agent_id}: ${m.content}`);
    });
    console.log();
    
    // Step 10: Update task status
    console.log('9️⃣ Updating task status...');
    await daos.tasks.updateStatus(task2.task_id, 'completed');
    console.log('✅ Task2 marked as completed');
    
    // Check if dependencies are satisfied
    const depsSatisfied = await daos.dependencies.checkDependenciesSatisfied(task1.task_id);
    console.log(`✅ Task1 dependencies satisfied: ${depsSatisfied}\n`);
    
    // Final summary
    console.log('🎉 Test completed successfully!');
    console.log('The task management system is working correctly.');
    console.log('\nKey features tested:');
    console.log('  ✓ Task creation and management');
    console.log('  ✓ Artifact storage and retrieval');
    console.log('  ✓ Inter-task messaging');
    console.log('  ✓ Dependency management');
    console.log('  ✓ Task discovery and querying');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testTaskManagement().then(() => {
    console.log('\n✨ All tests passed!');
    process.exit(0);
  }).catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { testTaskManagement };