# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Start development server with Turbopack
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
```

### Package Management
This project supports both npm and pnpm. All dependencies are managed through `package.json`.

## Architecture Overview

This is a **Mastra-based AI Assistant Platform** built with Next.js 15 that provides web search, weather information, and slide generation capabilities through an asynchronous job system with hierarchical agent networks. The platform features a sophisticated CEO-Manager-Worker agent pattern for complex task automation.

### Core Architecture Patterns

1. **Agent-Tool-Workflow Pattern**
   - **Agents** (`/src/mastra/agents/`): AI-powered assistants that handle user interactions
   - **Tools** (`/src/mastra/tools/`): Return job IDs immediately (< 100ms) for async operations
   - **Workflows** (`/src/mastra/workflows/`): Background processes that execute the actual work

2. **Hierarchical Agent Network**
   - **General Agent**: Main entry point that can delegate to specialized agents
   - **CEO Agent**: High-level task planning and delegation (responds once per task)
   - **Manager Agent**: Task breakdown and worker coordination
   - **Worker Agent**: Specific task execution (code, research, etc.)
   - Maximum 10 iterations with automatic routing between agents

3. **Job-Based Async System**
   - All long-running operations return job IDs immediately
   - Jobs transition through states: queued → running → completed/failed
   - Results are fetched via job ID when ready
   - Job results stored in `.job-results` directory
   - Real-time status updates via Server-Sent Events (SSE)

4. **Memory Management**
   - Thread-based conversation memory using LibSQL (in-memory by default)
   - User isolation for security
   - Shared memory between agents within a thread

5. **Authentication System**
   - Supabase authentication with middleware session management
   - Protected routes under `/protected/*`
   - Complete auth flow (login, signup, forgot password, email confirmation)

### Key Components

**Main Entry Points:**
- `/app/api/chat/route.ts`: Primary chat endpoint using general-agent
- `/app/api/job-result/[jobId]/route.ts`: Job result retrieval endpoint
- `/app/api/agent-logs/[jobId]/route.ts`: Agent conversation log retrieval
- `/app/api/agent-logs/stream/[jobId]/route.ts`: Real-time agent conversation streaming

**Mastra Configuration:**
- `/src/mastra/index.ts`: Central Mastra instance configuration
- Integrates OpenAI (o3), Anthropic (Claude Sonnet 4), and Google AI (Gemini 2.5 Flash) models
- Configures agents, tools, workflows, and memory

**Agent Implementation Pattern:**
All agents follow this structure:
- Use specific AI models (e.g., Claude Sonnet 4 for general-agent)
- Have access to specific tools
- Share thread memory
- Return streaming responses
- Japanese language instructions by default
- Log conversations to `.agent-network-logs` directory

**Tool Implementation Pattern:**
Tools must:
- Return results within 100ms
- Queue jobs for long-running operations
- Return job IDs for status tracking
- Handle errors gracefully
- Use `setTimeout(() => {...}, 0)` for background execution
- Handle circular dependencies with dynamic imports

**Workflow Implementation Pattern:**
- Use `createWorkflow` and `createStep` from Mastra
- Chain steps with `.then()`
- Define input/output schemas using Zod
- Implement error handling at each step
- Track progress via workflow events

### Environment Setup

Required environment variables (see `.env.local.example`):
```
# AI Provider Keys
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# Search APIs (optional)
EXA_API_KEY=your_key

# Logging (optional)
LOG_LEVEL=debug
```

### Testing Approach

No specific test framework is configured. When implementing tests:
1. Check if a testing framework needs to be added
2. Follow Next.js testing best practices
3. Test agents, tools, and workflows independently

### UI Components

Uses **shadcn/ui** with New York style theme and Lucide icons. When adding components:
1. Use existing shadcn/ui components when possible
2. Follow the established styling patterns in `/components/ui/`
3. Maintain dark mode compatibility
4. Use responsive design with Tailwind CSS

### Common Development Tasks

**Adding a new tool:**
1. Create tool file in `/src/mastra/tools/`
2. Implement job queuing pattern (return within 100ms)
3. Register in `/src/mastra/index.ts`
4. Add to relevant agents
5. Handle circular dependencies if needed

**Adding a new workflow:**
1. Create workflow file in `/src/mastra/workflows/`
2. Define steps with proper error handling and Zod schemas
3. Register in `/src/mastra/index.ts`
4. Create corresponding tool to trigger it
5. Implement progress tracking

**Adding a new agent:**
1. Create agent file in `/src/mastra/agents/`
2. Define instructions, model, and available tools
3. Register in `/src/mastra/index.ts`
4. Consider adding to agent network hierarchy if applicable

**Modifying chat behavior:**
1. Primary logic is in `/src/mastra/agents/general-agent.ts`
2. Chat UI is in `/app/protected/chat/page.tsx`
3. Streaming logic is in `/app/api/chat/route.ts`
4. Thread management in chat components

### Important Implementation Notes

- **Model Selection**: Chat UI allows dynamic model selection between Claude, OpenAI, and Gemini
- **Agent Network**: Uses `agent-network-tool` to delegate complex tasks to specialized agents
- **Logging**: Agent conversations logged to `.agent-network-logs` with timestamp-based filenames
- **SSE Support**: Real-time streaming for agent conversations and job status updates
- **TypeScript**: Strict mode enabled with path alias `@/*`
- **Error Handling**: All tools and workflows must implement proper error boundaries
- **Japanese-First Interface**: All UI text and agent instructions default to Japanese
- **Performance**: Tools must respond within 100ms; use background processing for long operations

### Agent Network Execution Flow

When using the agent network for complex tasks:

1. **Task Initiation**: General Agent analyzes request and uses `agentNetworkTool`
2. **Job Creation**: Tool returns job ID immediately while workflow starts in background
3. **Workflow Execution**: `agent-network-workflow` creates `NewAgentNetwork` instance
4. **Agent Coordination**: CEO → Manager → Worker agents collaborate (max 10 iterations)
5. **Result Storage**: Final results saved to `.job-results/[jobId].json`
6. **Status Tracking**: Use `jobStatusTool` and `jobResultTool` to monitor/retrieve results

### Key Files for Agent Network

- `/src/mastra/tools/agent-network-tool.ts`: Entry point for delegating tasks
- `/src/mastra/workflows/agent-network-workflow.ts`: Orchestrates agent network execution
- `/src/mastra/agents/network/`: CEO, Manager, and Worker agent definitions
- `/src/mastra/utils/agent-logger.ts`: Conversation logging utilities
- `/app/api/agent-logs/stream/[jobId]/route.ts`: SSE endpoint for real-time logs

### Model-Specific Behaviors

**Claude Sonnet 4** (default):
- Best for complex reasoning and Japanese language tasks
- Used by all network agents (CEO, Manager, Worker)
- Model ID: `claude-sonnet-4-20250514`

**OpenAI o3**:
- High-performance reasoning model
- Model ID: `o3-2025-04-16`
- Available in chat UI model selector

**Gemini 2.5 Flash**:
- Fast responses with visible thinking process
- Model ID: `gemini-2.5-flash`
- Cost-effective for simple tasks

### Project Structure

Key directories:
```
/app              # Next.js App Router pages and API routes
  /api            # API endpoints (chat, jobs, agent logs)
  /protected      # Authenticated pages (chat, dashboard)
/src
  /mastra         # Core Mastra configuration
    /agents       # AI agent definitions
      /network    # Hierarchical agents (CEO, Manager, Worker)
    /tools        # Tool implementations (must return < 100ms)
    /workflows    # Background workflow definitions
    /utils        # Utility functions (logging, etc.)
  /components     # React components
    /ui           # shadcn/ui components
  /lib            # Shared libraries and utilities
/components       # Additional UI components
/.job-results     # Async job results storage
/.agent-network-logs # Agent conversation logs
```

### Debugging Tips

- Check `.agent-network-logs` for detailed agent conversations
- Monitor job status using the job status tool
- Use SSE endpoint `/api/agent-logs/stream` for real-time agent logs
- Enable `LOG_LEVEL=debug` for detailed logging
- Job results are stored in `.job-results/[jobId].json`