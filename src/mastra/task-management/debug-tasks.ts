#!/usr/bin/env tsx
/**
 * Debug script to analyze task management issues
 */

import { initializeTaskManagementDB } from './db/migrations';
import { getDAOs } from './db/dao';

async function debugTasks() {
  console.log('🔍 Debugging Task Management System\n');
  
  try {
    // Initialize database
    const dbUrl = process.env.MASTRA_DB_URL || ':memory:';
    await initializeTaskManagementDB(dbUrl);
    const daos = getDAOs();
    
    // Get all tasks
    const query = `
      SELECT 
        network_id,
        task_id,
        task_type,
        task_description,
        step_number,
        status,
        created_at,
        updated_at
      FROM network_tasks
      ORDER BY network_id, step_number, created_at
    `;
    
    const db = (daos.tasks as any).db;
    const result = await db.execute({ sql: query, args: [] });
    const tasks = result.rows || [];
    
    console.log(`📊 Total tasks in database: ${tasks.length}\n`);
    
    // Group by network_id
    const tasksByNetwork: Record<string, any[]> = {};
    for (const task of tasks) {
      const networkId = task.network_id as string;
      if (!tasksByNetwork[networkId]) {
        tasksByNetwork[networkId] = [];
      }
      tasksByNetwork[networkId].push(task);
    }
    
    // Analyze each network
    for (const [networkId, networkTasks] of Object.entries(tasksByNetwork)) {
      console.log(`\n🌐 Network: ${networkId}`);
      console.log(`   Total tasks: ${networkTasks.length}`);
      
      // Count by step_number
      const stepCounts: Record<number, number> = {};
      const statusCounts: Record<string, number> = {};
      
      for (const task of networkTasks) {
        const step = task.step_number || 0;
        const status = task.status;
        
        stepCounts[step] = (stepCounts[step] || 0) + 1;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      
      // Check for duplicates
      const duplicateSteps = Object.entries(stepCounts)
        .filter(([_, count]) => count > 1)
        .map(([step, count]) => `Step ${step}: ${count} tasks`);
      
      if (duplicateSteps.length > 0) {
        console.log(`   ⚠️  Duplicate tasks found:`);
        duplicateSteps.forEach(dup => console.log(`      - ${dup}`));
      }
      
      console.log(`   Status breakdown:`);
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`      - ${status}: ${count}`);
      });
      
      // Show task details
      console.log(`   Task details:`);
      networkTasks
        .sort((a, b) => (a.step_number || 0) - (b.step_number || 0))
        .forEach(task => {
          console.log(`      Step ${task.step_number || '?'}: [${task.status}] ${task.task_type} - ${task.task_description.substring(0, 50)}...`);
          console.log(`         ID: ${task.task_id}`);
        });
    }
    
    // Check for orphaned tasks
    const orphanedQuery = `
      SELECT COUNT(*) as count 
      FROM network_tasks 
      WHERE network_id NOT IN (
        SELECT DISTINCT network_id FROM network_tasks WHERE created_by = 'ceo-agent'
      )
    `;
    
    const orphanedResult = await db.execute({ sql: orphanedQuery, args: [] });
    const orphanedCount = orphanedResult.rows[0]?.count || 0;
    
    if (orphanedCount > 0) {
      console.log(`\n⚠️  Found ${orphanedCount} orphaned tasks (tasks without CEO)`);
    }
    
    // Find the most recent network to analyze in detail
    const recentNetworkQuery = `
      SELECT network_id, MAX(created_at) as latest
      FROM network_tasks
      GROUP BY network_id
      ORDER BY latest DESC
      LIMIT 1
    `;
    
    const recentResult = await db.execute({ sql: recentNetworkQuery, args: [] });
    if (recentResult.rows.length > 0) {
      const recentNetworkId = recentResult.rows[0].network_id;
      console.log(`\n🔎 Analyzing most recent network: ${recentNetworkId}`);
      
      // Check task execution order
      const tasks = await daos.tasks.findByNetworkId(recentNetworkId);
      const queuedTasks = tasks.filter(t => t.status === 'queued');
      const runningTasks = tasks.filter(t => t.status === 'running');
      const completedTasks = tasks.filter(t => t.status === 'completed');
      
      console.log(`   Queued: ${queuedTasks.length}`);
      console.log(`   Running: ${runningTasks.length}`);
      console.log(`   Completed: ${completedTasks.length}`);
      
      // Check if tasks are being executed in order
      const sortedTasks = tasks.sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
      let lastCompletedStep = 0;
      let outOfOrderFound = false;
      
      for (const task of sortedTasks) {
        if (task.status === 'completed') {
          const step = task.step_number || 0;
          if (step < lastCompletedStep) {
            outOfOrderFound = true;
            console.log(`   ⚠️  Out of order execution: Step ${step} completed after Step ${lastCompletedStep}`);
          }
          lastCompletedStep = Math.max(lastCompletedStep, step);
        }
      }
      
      if (!outOfOrderFound) {
        console.log(`   ✅ Tasks are being executed in correct order`);
      }
    }
    
    console.log('\n✨ Debug analysis complete');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }
}

// Run the debug script
if (require.main === module) {
  debugTasks()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('💥 Debug failed:', error);
      process.exit(1);
    });
}

export { debugTasks };