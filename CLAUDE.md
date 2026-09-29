# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dental clinic management app (Ayag Dental): patients book online, admins run the front desk (walk-ins, queue, treatment, inventory, sales, reports), dentists manage schedules and dental records, and a superadmin manages staff, clinic settings, and archives. Started as a Lovable project (Vite + React + TypeScript + shadcn/ui + Tailwind); the backend is Vercel serverless functions on Neon Postgres.

## Commands

```bash
npm run dev          # Vite on :8080; proxies /api to http://localhost:3010
npm run build        # production build to dist/
npm run lint         # eslint .
npm test             # vitest run (all tests, jsdom)
npx vitest run src/test/slots.test.ts        # single file
npx vitest run -t "part of a test name"      # single test by name
```

The Vite dev server only serves the frontend. The `/api/*` functions must be running separately on port 3010 (Vercel functions, e.g. `vercel dev --listen 3010`) for anything past the landing page to work. Env vars come from `.env.local` / `.env.local.dev` (gitignored): `DATABASE_URL`, `JWT_SECRET`, `MIGRATE_SECRET`, `EMAILJS_PRIVATE_KEY`, and the `VITE_EMAILJS_*` IDs.

Deploys to Vercel; `vercel.json` rewrites every non-API path to `index.html` for client-side routing.

## Architecture

### Frontend (`src/`)
- `App.tsx` holds every route. Each role has its own URL prefix (`/admin`, `/patient`, `/dentist`, `/superadmin`) and page folder under `src/pages/<role>/`; routes are wrapped in `ProtectedRoute roles={[...]}` + `DashboardLayout`. `src/lib/roleHome.ts` maps role → home path.
- `src/contexts/AuthContext.tsx` owns auth (JWT + user in localStorage under `ayag_auth_*`) and exports the `api<T>(path, options)` fetch wrapper that every client module uses. It prefixes `/api`, attaches the Bearer token, and throws `ApiError` (which carries the server's extra response fields, e.g. what's blocking a 409).
- `src/lib/api/*.ts` are typed clients per resource. Writes to appointments dispatch the `APPOINTMENTS_CHANGED` window event so the notification bell and sidebar counts refresh immediately; `NotificationsContext` and `useAutoRefresh` handle the rest.
- `src/components/ui/` is generated shadcn/ui. Don't hand-edit unless necessary. Path alias `@/` → `src/`.

### Backend (`api/`)
- One file per Vercel function. Handlers are **multiplexed by query flags** rather than split into more files. For example, `api/staff.ts` serves staff CRUD plus `?directory=true`, `?schedule=true`, `?clinicHours=true`, `?clinicInfo=true`, `?unavailable=true`, and `api/dental-records.ts` also serves the services catalog. Add new sub-resources the same way instead of creating a new function file.
- Shared code lives in underscore dirs (`api/_lib`, `api/_db`), which Vercel doesn't expose as routes. `api/` uses Node16 ESM resolution, so relative imports need the `.js` suffix (`from "./_lib/db.js"`).
- DB access is `sql` tagged templates from `api/_lib/db.ts` (Neon serverless). Auth is `getSessionFromRequest(req)` in `api/_lib/auth.ts`, which returns `{ sub, email, role }`.
- Roles: `admin`, `dentist`, `superadmin` live in the `users` table; **patients are a separate `patients` table** (moved out of `users` by `migrate_v2`). Join patient data on `patients.id`, not `patient_id`, which doesn't exist there.
- Outbound email (OTP, appointment status changes) goes through the EmailJS REST API from `api/_lib/email.ts`. Dates/times are displayed in Manila time (`api/_lib/date.ts`).

### Schema and migrations
- `api/_db/schema.ts` (`SCHEMA_SQL`) is **additive-only, idempotent DDL** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Schema changes go here as new idempotent statements. Destructive or data-moving steps belong in a one-shot action in `api/admin/db.ts`.
- `api/admin/db.ts` is the admin endpoint, gated by `Authorization: Bearer $MIGRATE_SECRET`, with `action` = `migrate` | `migrate_v2` | `seed_settings` | `seed`. `seed` creates demo accounts (e.g. `admin@admin.com`/`admin123`, `user@user.com`/`user123`, `super@admin.com`/`super123`, `dentist@ayagdental.com`/`dentist123`).

### Appointments domain rules (`api/appointments.ts`)
- Statuses: `pending`, `confirmed`, `rescheduled`, `completed`, `cancelled`, `rejected`. `pending`, `confirmed`, and `rescheduled` hold a dentist's slot. Only `confirmed` and `rescheduled` count as approved, so the first of two clashing requests can still be approved.
- Bookings are time spans (`time`–`end_time`; rows without `end_time` default to 30 min). Clashes are overlap checks computed in minutes in JS. Dentists are matched by `dentist_id` **or** `dentist_name`, because older rows only carry the name.

## Testing conventions

- Tests live in `src/test/`, run under jsdom with `src/test/setup.ts` (stubs `matchMedia`). The timeout is raised to 15s because full-page renders are slow.
- API handler tests (`*-api.test.ts`) import the real handler and `vi.mock("../../api/_lib/db.js")` with a fake `sql` that dispatches on the query text. Several queries carry SQL comment markers (e.g. `/* slot-clash */`) specifically so the fake can recognise them. Keep these markers when editing those queries, and add one when a test needs to target a new query.
- Because `sql` is mocked everywhere, `src/test/sql-columns.test.ts` parses `schema.ts` and checks handler joins against the real columns. If you add a column, add it via `schema.ts` or this guard will fail.

## Other directories

`static-wireframe/` and `static-wireframe-bootstrap/` are standalone HTML mockups from early design, not part of the app build. `.claude/launch.json` also references a sibling Laravel port of this project (`../bright-grin-care-laravel`), which lives outside this repo.
