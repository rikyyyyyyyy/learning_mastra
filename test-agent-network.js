// Test script to trigger agent network and monitor SSE
const fetch = require('node-fetch');

async function testAgentNetwork() {
  console.log('🚀 Starting agent network test...');
  
  // Create a test job directly in the log store for testing
  const { agentLogStore } = require('./src/mastra/utils/agent-log-store');
  const testJobId = `agent-network-test-${Date.now()}`;
  
  // Create job in log store
  agentLogStore.createJob(testJobId, 'web-search');
  
  // Simulate some agent conversation entries
  setTimeout(() => {
    agentLogStore.addLogEntry(testJobId, {
      agentId: 'ceo',
      agentName: 'CEO Agent',
      message: 'Analyzing the weather search request...',
      timestamp: new Date().toISOString(),
      iteration: 1,
      messageType: 'response'
    });
  }, 1000);
  
  setTimeout(() => {
    agentLogStore.addLogEntry(testJobId, {
      agentId: 'manager',
      agentName: 'Manager Agent',
      message: 'Delegating to worker for weather API call...',
      timestamp: new Date().toISOString(),
      iteration: 2,
      messageType: 'response'
    });
  }, 2000);
  
  setTimeout(() => {
    agentLogStore.addLogEntry(testJobId, {
      agentId: 'worker',
      agentName: 'Worker Agent',
      message: 'Fetching current weather data...',
      timestamp: new Date().toISOString(),
      iteration: 3,
      messageType: 'response'
    });
  }, 3000);
  
  setTimeout(() => {
    agentLogStore.completeJob(testJobId, {
      totalIterations: 3,
      agentsInvolved: ['ceo-agent', 'manager-agent', 'worker-agent'],
      executionTime: '4s'
    });
  }, 4000);
  
  // Monitor the SSE stream
  monitorSSE(testJobId);
}

function monitorSSE(jobId) {
  console.log(`\n📡 Monitoring SSE for job: ${jobId}`);
  
  const EventSource = require('eventsource');
  const eventSource = new EventSource(`http://localhost:3000/api/agent-logs/stream/${jobId}`);
  
  eventSource.onopen = () => {
    console.log('✅ SSE connection opened');
  };
  
  eventSource.addEventListener('connected', (event) => {
    console.log('🔗 Connected:', JSON.parse(event.data));
  });
  
  eventSource.addEventListener('history', (event) => {
    const data = JSON.parse(event.data);
    console.log(`📜 History: ${data.count} entries`);
  });
  
  eventSource.addEventListener('log-entry', (event) => {
    const data = JSON.parse(event.data);
    console.log(`📝 [${data.entry.agentName}]: ${data.entry.message.substring(0, 100)}...`);
  });
  
  eventSource.addEventListener('job-completed', (event) => {
    console.log('✅ Job completed:', JSON.parse(event.data));
    eventSource.close();
    process.exit(0);
  });
  
  eventSource.onerror = (error) => {
    console.error('❌ SSE error:', error);
    if (error.status) {
      eventSource.close();
      process.exit(1);
    }
  };
}

testAgentNetwork().catch(console.error);