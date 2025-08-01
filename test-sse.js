const EventSource = require('eventsource');

// Test SSE connection
const jobId = 'agent-network-web-search-1735670469432-abc123';
const url = `http://localhost:3004/api/agent-logs/stream/${jobId}`;

console.log(`🔗 Connecting to: ${url}`);

const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.log('✅ SSE connection opened');
};

eventSource.onerror = (error) => {
  console.error('❌ SSE error:', error);
  if (error.status) {
    console.error('   Status:', error.status);
  }
  if (error.message) {
    console.error('   Message:', error.message);
  }
};

eventSource.onmessage = (event) => {
  console.log('📨 Message:', event.data);
};

eventSource.addEventListener('connected', (event) => {
  console.log('🔗 Connected event:', event.data);
});

eventSource.addEventListener('log-entry', (event) => {
  console.log('📝 Log entry:', event.data);
});

eventSource.addEventListener('heartbeat', (event) => {
  console.log('💓 Heartbeat:', event.data);
});

// Close connection after 30 seconds
setTimeout(() => {
  console.log('🔌 Closing connection');
  eventSource.close();
  process.exit(0);
}, 30000);