# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router (UI, `api/` routes, `protected/` admin + chat).
- `components/`: Reusable React UI (shadcn/ui, `ui/`, viewers).
- `src/mastra/`: Core logic — `agents/`, `networks/`, `tools/`, `config/` (model/tool registry), `task-management/`, `prompts/`, `workflows/`, `services/`, `utils/`, `mcp/`, `taskdb/`.
- `lib/`: Lightweight helpers for `app/` and `components/`.
- `.job-results/`: Background job outputs (JSON). Do not edit.
- `docs/`: Additional docs. Root config: `tailwind.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

## Build, Test, and Development Commands
- `pnpm dev`: Start dev server at http://localhost:3000 (Turbopack).
- `pnpm build`: Production build.
- `pnpm start`: Run the built app.
- `pnpm lint`: ESLint (Next.js + TypeScript rules).
- `pnpm test:artifact`: Run artifact‑system test (`src/mastra/task-management/test-artifact-system.ts`).
- Ad‑hoc checks: `npx tsx src/mastra/task-management/test-task-management.ts`.

## Coding Style & Naming Conventions
- **Language**: TypeScript, 2‑space indent; prefer `async/await`.
- **Exports**: use explicit return types for exported functions.
- **Components**: PascalCase (`components/MyWidget.tsx`).
- **App routes**: kebab-case (`app/protected/admin/page.tsx`).
- **Variables**: camelCase; **constants**: UPPER_SNAKE_CASE; **types**: PascalCase.
- **Tailwind**: keep classes minimal; use `clsx`, `tailwind-merge`, and `cva` where helpful.

## Testing Guidelines
- **Style**: lightweight script‑based tests with `tsx`.
- **Location/Names**: place under `src/mastra/**/` and name `test-*.ts`.
- **Deterministic**: avoid external network; use seed data as needed.
- **Background flows**: inspect `.job-results/{jobId}.json` to validate outputs.
- **Run**: `pnpm test:artifact` or `npx tsx <path-to-test>.ts`.

## Commit & Pull Request Guidelines
- **Commits**: Conventional style (`feat:`, `fix:`, `docs:`, `refactor:`). Use scopes when helpful (e.g., `feat(agents): add network tool`).
- **PRs**: include purpose, linked issues, run/test steps, and UI screenshots for visible changes. Note any env var or migration impacts.

## Security & Configuration Tips
- Copy `.env.local.example` to `.env.local`; set provider keys (OpenAI/Anthropic/Google, Supabase).
- Never commit secrets; keep `.env.local` local. Prefer shared config in `src/mastra/config/*`.

