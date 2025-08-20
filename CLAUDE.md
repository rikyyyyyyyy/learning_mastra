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

### Testing
```bash
# Test distributed task management system
npx tsx src/mastra/task-management/test-task-management.ts

# Test artifact and content-addressable storage system
npx tsx src/mastra/task-management/test-artifact-system.ts

# Test core task system
npx tsx src/mastra/task-management/test-task-system.ts
```

## Architecture Overview

This is a **Mastra-based AI Assistant Platform** built with Next.js 15 featuring a distributed task management system with hierarchical agent networks (CEO-Manager-Worker pattern), content-addressable storage (CAS), and advanced directive management. The platform enables parallel execution of multiple AI-powered tasks with real-time monitoring, inter-task communication, artifact versioning, and dynamic control.

### Core Architecture Patterns

1. **Distributed Task Management System (v4.0)**
   - **Task Registry**: Register and track multiple parallel tasks
   - **Content-Addressable Storage (CAS)**: Git-like deduplication and storage efficiency
   - **Artifact Version Control**: Revision tracking with parent references and commit messages
   - **Directive Management**: Send additional instructions to running tasks
   - **Policy Management**: CEO-level strategic policy setting
   - **Batch Task Creation**: Create multiple tasks simultaneously
   - Database backed by LibSQL with 12 main tables

2. **Hierarchical Agent Network**
   - **General Agent**: Entry point with task management and directive tools
   - **CEO Agent**: Strategic planning with policy management and task viewing
   - **Manager Agent**: Task breakdown with batch creation and directive handling
   - **Worker Agent**: Execution with specialized domain tools
   - Direct implementation via `agent-network-tool.ts` (no workflow layer)
   - Maximum 10 iterations with automatic routing
   - Dynamic agent creation via Agent Factory pattern

3. **Job-Based Async System**
   - Tools must return within 100ms (use `setTimeout(() => {...}, 0)` for background work)
   - Job IDs used as task IDs in the task management system
   - Results stored in `.job-results/{jobId}.json`
   - Real-time monitoring via SSE at `/api/agent-logs/stream/[jobId]`
   - Status progression: `queued → running → completed/failed`

4. **Memory & Authentication**
   - Thread-based memory using LibSQL (in-memory by default)
   - Supabase authentication with protected routes under `/protected/*`
   - Admin console for dynamic agent/network management at `/protected/admin/*`

### Database Schema

The system uses 12 main tables:

**Task Management:**
- `network_tasks`: Core task tracking with status, priority, parent tasks
- `network_directives`: Additional instructions for running tasks (policy_update, task_addition, priority_change, abort)
- `job_status`, `job_results`: Async job tracking and results
- `agent_logs`: Execution logs and debugging

**Content & Artifacts:**
- `content_store`: SHA-256 indexed content storage (deduplication)
- `content_chunks`: Large content chunking for efficiency
- `artifacts`: Task artifacts with metadata
- `artifact_revisions`: Git-like version control with parent tracking

**Configuration:**
- `agent_definitions`: Dynamic agent configurations
- `network_definitions`: Network topology and routing
- `threads`: Conversation thread memory

### Key Files

**Configuration & Entry Points:**
- `/src/mastra/index.ts`: Central Mastra configuration (agents, tools, memory)
- `/src/mastra/prompts/agent-prompts.ts`: All agent prompts in Japanese (centralized)
- `/src/mastra/config/model-registry.ts`: Multi-model management
- `/src/mastra/config/tool-registry.ts`: Role-based tool assignment
- `/app/api/chat/route.ts`: Main chat endpoint
- `/app/protected/chat/page.tsx`: Chat UI with model selector

**Task Management System:**
- `/src/mastra/task-management/db/`: 
  - `schema.ts`: Complete database schema
  - `migrations.ts`: Database initialization
  - `dao.ts`: Data Access Object pattern
  - `cas-dao.ts`: Content-Addressable Storage DAO
- `/src/mastra/task-management/tools/`:
  - `task-registry-tool.ts`: Register/list/update tasks
  - `directive-management-tool.ts`: Create/check directives to running tasks
  - `policy-management-tool.ts`: Save/retrieve CEO-level policies
  - `batch-task-creation-tool.ts`: Create multiple tasks in batch
  - `task-viewer-tool.ts`: View tasks and network summaries
  - `content-store-tool.ts`: Content-addressable storage operations
  - `artifact-io-tool.ts`: Artifact creation with version control
  - `artifact-diff-tool.ts`: Generate diffs between revisions
  - `final-result-tool.ts`: Store final results

**Agent Network:**
- `/src/mastra/tools/agent-network-tool.ts`: Direct NewAgentNetwork implementation
- `/src/mastra/agents/factory.ts`: Dynamic agent creation
- `/src/mastra/agents/network/`: CEO, Manager, Worker agents
- `/src/mastra/utils/agent-log-store.ts`: In-memory log store with EventEmitter

**Admin Interface:**
- `/app/protected/admin/agents/`: Agent definition management
- `/app/protected/admin/networks/`: Network configuration
- `/app/api/admin/agents/`: Agent management API
- `/app/api/admin/models/`: Model configuration API
- `/app/api/admin/networks/`: Network management API
- `/app/api/admin/tools/`: Tool registry API

**Database Viewers:**
- `/app/api/db-viewer/tasks/`: Task execution monitoring
- `/app/api/db-viewer/directives/`: Directive status tracking

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

# Optional
EXA_API_KEY=your_key               # Web search
LOG_LEVEL=debug                    # Debugging
AGENT_NETWORK_DEBUG=true           # Agent network logs
```

### Development Patterns

**Adding a Tool:**
1. Create in `/src/mastra/tools/` with < 100ms response time
2. Register in `/src/mastra/config/tool-registry.ts`
3. Add to relevant role's tool arrays
4. Update `/src/mastra/index.ts` tools object

**Adding an Agent:**
1. Option A: Use Admin Console at `/protected/admin/agents/`
2. Option B: Create programmatically:
   - Create in `/src/mastra/agents/`
   - Add prompt to `/src/mastra/prompts/agent-prompts.ts`
   - Register in `/src/mastra/index.ts`

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
    priority: 'high',
    parentTaskId: 'parent-task-id' // Optional
  }
});

// Send directive to running task
await directiveManagementTool({
  action: 'create_directive',
  networkId: 'network-123',
  directiveData: {
    content: 'Increase quality standards and add more detail',
    type: 'policy_update', // or 'task_addition', 'priority_change', 'abort'
    source: 'general-agent'
  }
});

// Save CEO-level policy
await policyManagementTool({
  action: 'save_policy',
  networkId: 'network-123',
  policy: {
    strategy: 'Comprehensive market analysis',
    priorities: ['Data accuracy', 'Depth of analysis'],
    successCriteria: ['All competitors identified'],
    qualityStandards: ['Use reliable sources only']
  }
});

// Create batch tasks
await batchTaskCreationTool({
  action: 'create_batch',
  networkId: 'network-123',
  tasks: [
    { task_type: 'research', task_description: 'Market analysis', priority: 'high' },
    { task_type: 'analysis', task_description: 'Competitor study', priority: 'medium' }
  ]
});

// Store content with deduplication
const { hash } = await contentStoreTool({
  action: 'store',
  content: htmlContent,
  contentType: 'text/html'
});

// Create artifact with version control
await artifactIOTool({
  action: 'create',
  jobId: 'job-123',
  mimeType: 'text/html',
  parentRevisionId: 'parent-rev-id', // Optional
  commitMessage: 'Initial HTML generation',
  author: 'worker-agent'
});

// Generate diff between revisions
await artifactDiffTool({
  action: 'diff',
  fromRevisionId: 'rev-1',
  toRevisionId: 'rev-2'
});
```

### Content-Addressable Storage (CAS)

The system implements Git-like content storage:
- **Deduplication**: Content stored once, referenced by SHA-256 hash
- **References**: Use `ref:hash` format to reference stored content
- **Chunking**: Large content split into chunks for efficiency
- **Version Control**: Track artifact revisions with parent references
- **Space Efficiency**: Significant storage savings through deduplication

### Models

- **Claude Sonnet 4** (`claude-sonnet-4-20250514`): Default, best for Japanese
- **GPT-5** (`gpt-5`): Latest OpenAI model
- **OpenAI o3** (`o3-2025-04-16`): High-performance reasoning
- **Gemini 2.5 Flash** (`gemini-2.5-flash`): Fast, cost-effective

### API Endpoints

**Chat & Streaming:**
- `POST /api/chat`: Main chat endpoint with streaming

**Admin Management:**
- `GET/POST /api/admin/agents`: Agent definition management
- `GET/POST /api/admin/networks`: Network configuration
- `GET/POST /api/admin/models`: Model management
- `GET /api/admin/tools`: Available tools listing

**Job & Monitoring:**
- `GET /api/job-result/[jobId]`: Retrieve async job results
- `GET /api/agent-logs/stream/[jobId]`: Real-time SSE logs
- `GET /api/db-viewer/tasks`: Task execution monitoring
- `GET /api/db-viewer/directives`: Directive status tracking

### Important Notes

- **Japanese-First**: All agent prompts and UI text are in Japanese
- **TypeScript**: Strict mode with `@/*` path alias
- **Job Results**: Stored in `.job-results/{jobId}.json`
- **Task IDs**: Same as job IDs for consistency
- **SSE Streaming**: Real-time logs at `/api/agent-logs/stream/[jobId]`
- **Performance**: Tools MUST return within 100ms
- **Circular Dependencies**: Handle with dynamic imports in tools
- **CAS References**: Use `ref:hash` format for stored content
- **Admin Console**: Dynamic agent/network management at `/protected/admin/`
- **Database**: LibSQL with in-memory storage (`:memory:`) by default