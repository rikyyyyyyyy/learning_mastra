# Agent Network Logging Enhancement Guide

This document describes the enhanced logging system for tracking agent communications within the Mastra AgentNetwork.

## Overview

The enhanced logging system provides comprehensive tracking of agent interactions, including:
- Message interception between agents
- Conversation history with metadata
- Performance metrics
- Debug information

## Key Components

### 1. Enhanced Conversation Schema
The conversation entry now includes:
- `messageType`: Indicates if it's a request, response, or internal message
- `metadata`: Contains model info, tools used, token count, and execution time

### 2. Agent Communication Tracer
Located in `/src/mastra/utils/agent-logger.ts`, provides:
- Real-time message tracking
- Conversation history retrieval
- Agent-specific message filtering
- Communication statistics

### 3. Enhanced Workflow Logging
The `agent-network-workflow.ts` now features:
- Console log interception
- Message buffer for reconstruction
- Multiple fallback methods for history retrieval
- Tracer integration for comprehensive logging

### 4. API Enhancements
The `/api/agent-logs/[jobId]` endpoint now returns:
- Detailed conversation history
- Conversation statistics
- Debug information (when enabled)

## Usage

### Enabling Debug Mode
Set the environment variable to enable verbose logging:
```bash
AGENT_NETWORK_DEBUG=true
```

### Accessing Agent Logs
Use the job ID to retrieve conversation history:
```typescript
const response = await fetch(`/api/agent-logs/${jobId}`);
const logs = await response.json();
```

### Log Structure
```json
{
  "jobId": "agent-network-web-search-12345",
  "taskType": "web-search",
  "success": true,
  "conversationHistory": [
    {
      "agentId": "ceo",
      "agentName": "CEO Agent - Strategic Task Director",
      "message": "Strategic direction for the task...",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "iteration": 1,
      "messageType": "response",
      "metadata": {
        "model": "claude-sonnet-4-20250514",
        "executionTime": 1234
      }
    }
  ],
  "conversationStats": {
    "totalMessages": 6,
    "messagesByAgent": {
      "ceo": 2,
      "manager": 2,
      "worker": 2
    },
    "messagesByType": {
      "request": 3,
      "response": 3
    },
    "totalIterations": 3
  },
  "executionSummary": {
    "totalIterations": 3,
    "agentsInvolved": ["ceo", "manager", "worker"],
    "executionTime": "5.23s",
    "messageStats": {...},
    "agentCommunicationStats": {...}
  }
}
```

## Implementation Details

### Message Interception
The system intercepts console logs to capture agent communications:
1. Detects agent-related log patterns
2. Extracts agent IDs and messages
3. Tracks iteration changes
4. Stores messages in buffer

### History Retrieval Methods
The system attempts multiple methods to retrieve agent history:
1. `getAgentInteractionHistory()` - Primary method
2. `getAgentHistory()` - Fallback method
3. `getMessages()` - Alternative method
4. Direct property access (`_messages`)
5. Agent memory access
6. Result object inspection
7. Message buffer reconstruction

### Performance Tracking
Each conversation entry can include:
- Execution time per message
- Token count (when available)
- Tools used by the agent
- Model information

## Troubleshooting

### No conversation history
If conversation history is empty:
1. Check if `AGENT_NETWORK_DEBUG=true` is set
2. Verify the job has completed
3. Check console logs for interception messages

### Missing agent messages
If specific agent messages are missing:
1. Ensure all agents are properly registered
2. Check agent name mapping in workflow
3. Verify log patterns match current format

## Future Enhancements

1. **Real-time streaming**: Stream conversation updates via WebSocket
2. **Advanced filtering**: Filter by timestamp, agent, message type
3. **Export functionality**: Export conversations in various formats
4. **Visualization**: Add conversation flow diagrams
5. **Token usage tracking**: Detailed token consumption metrics