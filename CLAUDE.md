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

This is a **Mastra-based AI Assistant** built with Next.js that provides web search, weather information, and slide generation capabilities through an asynchronous job system.

### Core Architecture Patterns

1. **Agent-Tool-Workflow Pattern**
   - **Agents** (`/src/mastra/agents/`): AI-powered assistants that handle user interactions
   - **Tools** (`/src/mastra/tools/`): Return job IDs immediately (< 100ms) for async operations
   - **Workflows** (`/src/mastra/workflows/`): Background processes that execute the actual work

2. **Job-Based Async System**
   - All long-running operations return job IDs immediately
   - Jobs transition through states: queued → running → completed/failed
   - Results are fetched via job ID when ready
   - Job results stored in `.job-results` directory

3. **Memory Management**
   - Thread-based conversation memory using LibSQL (in-memory by default)
   - User isolation for security
   - Shared memory between agents within a thread

4. **Authentication System**
   - Supabase authentication with middleware session management
   - Protected routes under `/protected/*`
   - Complete auth flow (login, signup, forgot password, email confirmation)

### Key Components

**Main Entry Points:**
- `/app/api/chat/route.ts`: Primary chat endpoint using general-agent
- `/app/api/job-result/[jobId]/route.ts`: Job result retrieval endpoint

**Mastra Configuration:**
- `/src/mastra/index.ts`: Central Mastra instance configuration
- Integrates OpenAI (GPT-4o Search Preview), Anthropic (Claude Sonnet 4), and Google AI models
- MCP (Model Context Protocol) support for Brave search
- Configures agents, tools, workflows, and memory

**Agent Implementation Pattern:**
All agents follow this structure:
- Use specific AI models (e.g., Claude Sonnet 4 for general-agent)
- Have access to specific tools
- Share thread memory
- Return streaming responses
- Japanese language instructions by default

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

# Brave Search (MCP)
BRAVE_API_KEY=your_key
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

**Modifying chat behavior:**
1. Primary logic is in `/src/mastra/agents/general-agent.ts`
2. Chat UI is in `/app/protected/chat/page.tsx`
3. Streaming logic is in `/app/api/chat/route.ts`
4. Thread management in chat components

### Important Implementation Notes

- **GPT-4o Search Preview** doesn't support temperature parameter
- **Slide preview tool** must be called after slide generation for HTML preview
- **MCP tools** are wrapped as Mastra tools for consistency
- **Logging** uses PinoLogger for structured output
- **TypeScript** strict mode is enabled with path alias `@/*`