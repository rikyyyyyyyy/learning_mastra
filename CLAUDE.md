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

### Testing Task Management System
```bash
npx tsx src/mastra/task-management/test-task-management.ts  # Test distributed task management
```

## Architecture Overview

This is a **Mastra-based AI Assistant Platform** built with Next.js 15 featuring a distributed task management system with hierarchical agent networks (CEO-Manager-Worker pattern). The platform enables parallel execution of multiple AI-powered tasks with real-time monitoring, inter-task communication, and artifact sharing.

### Core Architecture Patterns

1. **Distributed Task Management System (v4.0)**
   - **Task Registry**: Register and track multiple parallel tasks
   - **Artifact Store**: Share results between tasks
   - **Task Communication**: Send messages to running tasks
   - **Task Discovery**: Find related tasks and manage dependencies
   - Database backed by LibSQL with 4 main tables: `network_tasks`, `task_artifacts`, `task_communications`, `task_dependencies`

2. **Hierarchical Agent Network**
   - **General Agent**: Entry point with access to task management tools
   - **CEO Agent**: Strategic planning, can discover and communicate with other tasks
   - **Manager Agent**: Task breakdown, registers subtasks, manages artifacts
   - **Worker Agent**: Execution with specialized tools
   - Direct implementation via `agent-network-tool.ts` (no workflow layer)
   - Maximum 10 iterations with automatic routing

3. **Job-Based Async System**
   - Tools must return within 100ms (use `setTimeout(() => {...}, 0)` for background work)
   - Job IDs used as task IDs in the task management system
   - Results stored in `.job-results/{jobId}.json`
   - Real-time monitoring via SSE at `/api/agent-logs/stream/[jobId]`

4. **Memory & Authentication**
   - Thread-based memory using LibSQL (in-memory by default)
   - Supabase authentication with protected routes under `/protected/*`

### Key Files

**Configuration & Entry Points:**
- `/src/mastra/index.ts`: Central Mastra configuration (agents, tools, memory)
- `/src/mastra/prompts/agent-prompts.ts`: All agent prompts in Japanese (centralized)
- `/app/api/chat/route.ts`: Main chat endpoint
- `/app/protected/chat/page.tsx`: Chat UI with model selector

**Task Management System:**
- `/src/mastra/task-management/db/`: Database schema, migrations, DAO
- `/src/mastra/task-management/tools/`:
  - `task-registry-tool.ts`: Register/list/update tasks
  - `artifact-store-tool.ts`: Store/retrieve/list artifacts
  - `task-communication-tool.ts`: Send/receive messages between tasks
  - `task-discovery-tool.ts`: Find related tasks, manage dependencies

**Agent Network:**
- `/src/mastra/tools/agent-network-tool.ts`: Direct NewAgentNetwork implementation
- `/src/mastra/agents/network/`: CEO, Manager, Worker agents
- `/src/mastra/utils/agent-log-store.ts`: In-memory log store with EventEmitter

**Tool Implementation Requirements:**
- Must return within 100ms (use `setTimeout(() => {...}, 0)` for async work)
- Return job IDs for long operations
- Handle circular dependencies with dynamic imports
- Use try-catch for error handling

### Environment Variables

Required in `.env.local`:
```env
# AI Provider Keys (required)
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Supabase Auth (required)
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# Optional
EXA_API_KEY=your_key               # Web search
LOG_LEVEL=debug                    # Debugging
AGENT_NETWORK_DEBUG=true           # Agent network logs
```

### Development Patterns

**Adding a Tool:**
1. Create in `/src/mastra/tools/` with < 100ms response time
2. Register in `/src/mastra/index.ts` tools object
3. Add to relevant agents' tool arrays

**Adding an Agent:**
1. Create in `/src/mastra/agents/`
2. Add prompt to `/src/mastra/prompts/agent-prompts.ts`
3. Register in `/src/mastra/index.ts`

**UI Components:**
- Uses shadcn/ui (New York style) with Lucide icons
- Dark mode support via next-themes
- Components in `/components/ui/`

### Task Management Tools Usage

```typescript
// Register a new task
await taskRegistryTool({
  action: 'register',
  taskData: {
    taskType: 'slide-generation',
    taskDescription: 'Create AI presentation',
    priority: 'high'
  }
});

// Store and share artifacts
await artifactStoreTool({
  action: 'store',
  taskId: jobId,
  artifactData: {
    artifactType: 'html',
    content: htmlContent,
    isPublic: true  // Allow other tasks to access
  }
});

// Communicate between tasks
await taskCommunicationTool({
  action: 'send',
  messageData: {
    toTaskId: targetTaskId,
    messageType: 'instruction',
    content: 'Additional requirements...'
  }
});
```

### Models

- **Claude Sonnet 4** (`claude-sonnet-4-20250514`): Default, best for Japanese
- **OpenAI o3** (`o3-2025-04-16`): High-performance reasoning
- **Gemini 2.5 Flash** (`gemini-2.5-flash`): Fast, cost-effective

### Important Notes

- **Japanese-First**: All agent prompts and UI text are in Japanese
- **TypeScript**: Strict mode with `@/*` path alias
- **Job Results**: Stored in `.job-results/{jobId}.json`
- **Task IDs**: Same as job IDs for consistency
- **SSE Streaming**: Real-time logs at `/api/agent-logs/stream/[jobId]`
- **Performance**: Tools MUST return within 100ms
- **Circular Dependencies**: Handle with dynamic imports in tools