# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router (UI, `api/` routes, `protected/` admin + chat).
- `components/`: Reusable React UI (shadcn/ui, `ui/`, viewers).
- `src/mastra/`: Core logic — `agents/`, `networks/`, `tools/`, `config/` (model- and tool-registry), `task-management/`, `prompts/`, `workflows/`, `services/`, `utils/`, `mcp/`, `taskdb/`.
- `lib/`: Lightweight helpers used by app/components.
- `.job-results/`: Background job outputs (JSON). Do not edit manually.
- `docs/`: Additional documentation. Config: `tailwind.config.ts`, `eslint.config.mjs`, `tsconfig.json`.

## Build, Test, and Development Commands
- `pnpm dev` (or `npm run dev`): Start dev server with Turbopack at `http://localhost:3000`.
- `pnpm build`: Production build.
- `pnpm start`: Run the built app.
- `pnpm lint`: ESLint (Next.js rules, TypeScript).
- `pnpm test:artifact`: Run artifact-system test (`src/mastra/task-management/test-artifact-system.ts`).
- Example: `npx tsx src/mastra/task-management/test-task-management.ts` to run ad‑hoc checks.

## Coding Style & Naming Conventions
- TypeScript, 2-space indent, prefer `async/await` and explicit return types for exported functions.
- Components: PascalCase (`components/MyWidget.tsx`). Files in `app/` routes: kebab-case (`app/protected/admin/page.tsx`).
- Variables/functions: camelCase; constants: UPPER_SNAKE_CASE; types/interfaces: PascalCase (`UserTask`).
- Run `pnpm lint` before pushing; fix simple issues with your editor’s ESLint integration.
- Tailwind: keep classes minimal; use `clsx` and `tailwind-merge` (and `cva` where applicable).

## Testing Guidelines
- Lightweight script-based tests with `tsx`; place under `src/mastra/**/` and name `test-*.ts`.
- Keep tests deterministic (no external network). Use seed data where needed.
- Validate background flows by inspecting `.job-results/{jobId}.json` when relevant.
- No formal coverage requirement yet; prefer small, focused tests close to the code under test.

## Commit & Pull Request Guidelines
- Conventional style commits: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...` (see git history).
- Commits are imperative, concise, and scoped when helpful (`feat(agents): add network tool`).
- PRs include: clear purpose, linked issues, test/run steps, and UI screenshots for visible changes. Note any env var or migration impacts.

## Security & Configuration Tips
- Copy `.env.local.example` to `.env.local` and set provider keys (OpenAI/Anthropic/Google, Supabase).
- Never commit secrets; keep `.env.local` local. Prefer config via `src/mastra/config/*` for shared settings.
