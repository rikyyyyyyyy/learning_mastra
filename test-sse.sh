#!/bin/bash

# Create a test job ID
JOB_ID="agent-network-test-$(date +%s)"

echo "🚀 Testing SSE with job ID: $JOB_ID"

# First, let's create a job using a simple API call
echo "Creating test job..."

# Start monitoring SSE in background
echo "📡 Starting SSE monitoring..."
curl -N -H "Accept: text/event-stream" "http://localhost:3000/api/agent-logs/stream/$JOB_ID" &
SSE_PID=$!

# Wait a moment for SSE to connect
sleep 2

# Now simulate adding logs using a direct API call (if we had one)
# For now, let's just monitor
echo "Monitoring for 10 seconds..."
sleep 10

# Kill the SSE connection
kill $SSE_PID 2>/dev/null

echo "✅ Test complete"