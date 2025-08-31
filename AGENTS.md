# Repository Guidelines

This guide helps contributors work effectively in this Next.js + TypeScript codebase. Keep changes focused, add clear context, and follow the conventions below.

## Project Structure & Module Organization
- `app/`: Next.js App Router UI and `api/` routes; protected areas under `app/protected/` (e.g., `admin/`, `chat/`).
- `components/`: Reusable React UI (shadcn/ui) under `ui/`, plus custom viewers.
- `src/mastra/`: Core logic — `agents/`, `networks/`, `tools/`, `config/` (model/tool registry), `task-management/`, `prompts/`, `workflows/`, `services/`, `utils/`, `mcp/`, `taskdb/`.
- `lib/`: Lightweight helpers shared by `app/` and `components/`.
- `.job-results/`: Background job outputs (JSON). Do not edit.
- `docs/`: Extra docs. Root configs: `tailwind.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

## Build, Test, and Development Commands
- `pnpm dev`: Start dev server at `http://localhost:3000` (Turbopack).
- `pnpm build`: Production build.
- `pnpm start`: Run the built app.
- `pnpm lint`: ESLint (Next.js + TypeScript rules).
- `pnpm test:artifact`: Run artifact‑system test (`src/mastra/task-management/test-artifact-system.ts`).
- `npx tsx src/mastra/task-management/test-task-management.ts`: Ad‑hoc task‑management checks.

## Coding Style & Naming Conventions
- **Language**: TypeScript, 2‑space indent; prefer `async/await`.
- **Exports**: Use explicit return types for exported functions.
- **Components**: PascalCase (e.g., `components/MyWidget.tsx`).
- **App routes**: kebab-case (e.g., `app/protected/admin/page.tsx`).
- **Variables**: camelCase; **constants**: `UPPER_SNAKE_CASE`; **types**: PascalCase.
- **Tailwind**: Keep classes minimal; use `clsx`, `tailwind-merge`, and `cva` when helpful.

## Testing Guidelines
- **Style**: Lightweight script-based tests via `tsx`.
- **Location/Names**: Place under `src/mastra/**/` named `test-*.ts`.
- **Deterministic**: Avoid external network; use seed data when needed.
- **Background flows**: Inspect `.job-results/{jobId}.json` to validate outputs.
- **Run**: `pnpm test:artifact` or `npx tsx <path-to-test>.ts`.

## Commit & Pull Request Guidelines
- **Commits**: Conventional (`feat:`, `fix:`, `docs:`, `refactor:`). Use scopes when useful (e.g., `feat(agents): add network tool`).
- **PRs**: Include purpose, linked issues, run/test steps, and UI screenshots for visible changes. Note any env var or migration impacts.

## Security & Configuration Tips
- Copy `.env.local.example` to `.env.local`; set provider keys (OpenAI/Anthropic/Google, Supabase).
- Never commit secrets; prefer shared config in `src/mastra/config/*`.

