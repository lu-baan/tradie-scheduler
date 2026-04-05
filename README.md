```markdown
# Job Sorter / Trade Scheduler

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies, with the main application living in the `trade-scheduler` directory and shared tools in `lib`.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: Vite (Frontend), esbuild/tsx (Backend CJS bundle)

## Artifacts

### Trade Scheduler Frontend (`trade-scheduler/frontend`)

Full-featured scheduling app for Australian tradespeople. Deployed on **Vercel**.

- React + Vite frontend
- Two enquiry types: Quote (auto 1hr + travel) and Job Booking (full details)
- Validity codes 1/2/3 (job desirability rating), Emergency Code 9 override
- Smart sorting algorithm: weighted price + distance + validity code score
- Browser geolocation for distance calculations (km)
- Calendar weekly view, Workers management with availability toggles
- Invoice generation with 10% Australian GST
- Uses: wouter, React Query, Shadcn UI, date-fns, recharts, react-hook-form, framer-motion

## Structure

```text
Job-Sorter/
├── trade-scheduler/            # Deployable applications
│   ├── frontend/               # React + Vite frontend (Vercel)
│   └── backend/                # Express API server (Render)
├── lib/                        # Shared libraries
│   ├── api-spec/               # OpenAPI spec + Orval codegen config
│   ├── api-client-react/       # Generated React Query hooks
│   ├── api-zod/                # Generated Zod schemas from OpenAPI
│   └── db/                     # Drizzle ORM schema + DB connection
├── scripts/                    # Utility scripts
│   └── src/                    # Individual .ts scripts
├── pnpm-workspace.yaml         # pnpm workspace config
├── tsconfig.base.json          # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json               # Root TS project references
└── package.json                # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck` runs `tsc --build --emitDeclarationOnly` using the full dependency graph. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — only `.d.ts` files are emitted during typecheck; JS bundling is handled by esbuild/tsx/vite.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array.

## Root Scripts

```sh
pnpm run build       # runs typecheck first, then build in all packages that define it
pnpm run typecheck   # runs tsc --build --emitDeclarationOnly
```

## Packages

### `trade-scheduler/backend` (`trade-scheduler-backend`)

Express 5 API server. Routes use `@workspace/api-zod` for validation and `@workspace/db` for persistence. Deployed on **Render**.

- `src/index.ts` — reads `PORT`, starts Express
- `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- `src/routes/index.ts` — mounts sub-routers
- `src/routes/health.ts` — `GET /api/healthz`
- `build.ts` — custom esbuild script for production CJS bundling

```sh
pnpm --filter trade-scheduler-backend run dev    # dev server
pnpm --filter trade-scheduler-backend run build  # custom build.ts → dist/index.cjs
pnpm --filter trade-scheduler-backend run db:push # pushes Drizzle schema to DB
```

### `trade-scheduler/frontend` (`@workspace/trade-scheduler`)

Vite + React SPA routing. Consumes shared workspace packages.

```sh
pnpm --filter @workspace/trade-scheduler... run dev
pnpm --filter @workspace/trade-scheduler... run build
```

### `lib/db` (`@workspace/db`)

Drizzle ORM + PostgreSQL. Exports a Drizzle client instance and schema. 
*Note: DB connection requires `DATABASE_URL` pointing to the Supabase connection pooler.*

- `src/index.ts` — creates `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas

### `lib/api-spec` (`@workspace/api-spec`)

Owns `openapi.yaml` and `orval.config.ts`. Codegen outputs to:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

```sh
pnpm --filter @workspace/api-spec run codegen
```

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by the backend for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts. Each `.ts` file in `src/` has a corresponding npm script in `package.json`.

```sh
pnpm --filter @workspace/scripts run <script>
```
```