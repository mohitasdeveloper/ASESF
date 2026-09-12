# ASES — Academic Schedule Execution System

Centralised timetable management, faculty scheduling, and daily lecture execution tracking for
B. K. Birla College, Kalyan. Built with Next.js (App Router) and Supabase, with one Supabase
project per department behind a single frontend.

## Features

**Master data**
- Rooms, Subjects, and Courses — full CRUD, search, sort, Excel/PDF export
- CSF Mapping — links Course × Subject × Faculty, with cascading dropdowns and filters

**Timetabling**
- Master Timetable — the fixed weekly grid editor (day tabs, room × time-slot grid,
  click-to-assign, a separate section for flexible-time "virtual" lectures), Excel/PDF export
- Weekly Timetable View — read-only pivot, filterable by Course / Faculty / Room

**Daily operations**
- Daily Scheduler — generate a day's schedule from the Master Timetable or start blank; handle
  absences, double-bookings, cancellations, and replacements
- Execution Log — mark each lecture On Time / Late / Not Engaged as the day runs, with live stats
- Faculty Leaves — quick "mark absent today," full leave records, filtering
- Faculty Remarks — searchable per-faculty remarks log

**Admin & reporting**
- Users — create/edit/deactivate faculty and admin accounts, force password reset, change email
- Holidays — declare/remove, with duplicate-date handling
- Reports — 10 report types: Daily Summary, Faculty Lectures, Not Engaged/Unmarked, By Course,
  By Subject, By Room, Rescheduled Slots, Leave Summary, a color-coded Daily Execution grid, and
  the Lecture Taken Report (load calculation by faculty type, with subtotals)

**Faculty portal**
- Today's schedule timeline, recent executions, recent leave history — a faculty member's own
  read-only view

## Tech stack

- **Next.js 14** (App Router, TypeScript) — server-side route protection, no client-only redirects
- **Supabase** (`@supabase/ssr`) — auth, Postgres, Row Level Security
- **Tom Select** — relational/multi-select dropdowns
- **xlsx** + **jsPDF** — Excel/PDF export with the college letterhead, dynamically imported so
  they don't bloat the initial bundle
- **Flatpickr** — date picker

## Multi-department architecture

Each department is a **separate, fully independent Supabase project** — its own database, its
own users, its own data. One Next.js frontend serves all of them; the login page's **Department**
dropdown decides which project a given browser session talks to.

Currently configured: `DMS` (Management Studies) and `DMMC` (Multimedia & Mass Communication).

All of it lives in `lib/supabase/`:

| File | Role |
|---|---|
| `departments.ts` | The registry — code, label, branding text, and env var names per department. The one place to touch when adding a department. |
| `client.ts` | Browser Supabase client. Keeps its own cache of one real client per department (not a single global one), so switching departments mid-session always talks to the right project. |
| `server.ts` | Server Component / Server Action client — resolves the department from the `ases_dept` cookie on every request. |
| `middleware.ts` | Refreshes the auth session cookie on every request, for whichever department is active. |

The `ases_dept` cookie is intentionally not secret/httpOnly — it only ever holds a department
code, never credentials. Each Supabase project's auth cookie is namespaced by that project's own
URL, so two departments never share a session.

Every page and query elsewhere in the app just calls `createClient()` with no arguments — the
department resolution is invisible outside `lib/supabase/`.

### Adding another department

1. Run `supabase/new-department-setup.sql` against a new, empty Supabase project (edit the
   `department_name`/logo values near the bottom of the file first).
2. Add its Project URL + anon key as two new env vars, following the
   `NEXT_PUBLIC_SUPABASE_URL_<CODE>` / `NEXT_PUBLIC_SUPABASE_ANON_KEY_<CODE>` pattern.
3. Add one entry to `DEPARTMENTS` and `DEPARTMENT_LIST` in `lib/supabase/departments.ts`, and add
   `<CODE>` to the `Dept` type.

No other file needs to change. `schema.sql` and `supabase/new-department-setup.sql` are kept in
sync with the live database schema (including RLS policies on every table and the
`virtual_start_time`/`virtual_end_time` columns) — a department bootstrapped from the setup
script should come up fully working without any manual follow-up SQL.

### Known limitation

The `admin-create-user` Edge Function (used by the Users page's "Add User" screen to create
Supabase Auth accounts with the service-role key) is deployed directly to each department's own
Supabase project rather than living in this repo. It needs to be deployed separately to every new
department, with that project's own URL saved into its `app_settings.edge_function_base_url` row.
Until that's done for a department, everything else works, but "Add User" won't.

## Project structure

```
app/
  (admin)/            Admin-only pages — rooms, subjects, courses, csf-mapping,
                       master-timetable, weekly-timetable, daily-scheduler, execution,
                       leaves, remarks, holidays, users, reports, dashboard
  (faculty)/           Faculty portal
  (shared)/            Pages reachable by both roles (change-password)
  api/whoami/          Server-side role lookup, used right after sign-in
lib/
  auth.ts              getSession() / requireRole() — server-side session + role checks
  masterTimetable.ts   Shared data layer for the timetable pages
  reportsData.ts       Query logic behind every report type
  exportHelpers.ts     Shared Excel/PDF export (with letterhead)
  settings.ts / settings.server.ts   App-wide branding/config, loaded from app_settings
  supabase/            Multi-department Supabase clients — see above
components/            Sidebar, LoginForm, Toast, TomSelectField/Multi, ReportTable, etc.
schema.sql             Full database schema (source of truth) — apply to a fresh project
supabase/new-department-setup.sql   One-shot setup script for a brand-new department project
```

## Setup

```bash
npm install
```

Copy `.env.local.example` to `.env.local` and fill in each department's Supabase project URL and
anon (publishable) key:

```
NEXT_PUBLIC_SUPABASE_URL_DMS=
NEXT_PUBLIC_SUPABASE_ANON_KEY_DMS=
NEXT_PUBLIC_SUPABASE_URL_DMMC=
NEXT_PUBLIC_SUPABASE_ANON_KEY_DMMC=
```

Run `app_settings.sql` (project root) in each Supabase project's SQL editor — it creates a
single-row `app_settings` table (college name, subtitle, department name, logos, Edge Function
URL) that every page after login reads from. It's seeded with sensible defaults, so nothing
changes visually until you edit the row. (For a brand-new department, this is already included in
`supabase/new-department-setup.sql` — no separate step needed.)

```bash
npm run dev
```

Visit `http://localhost:3000`.

**There is no admin UI for `app_settings` by design** — edit the row directly in the Supabase
Table Editor or via SQL when branding or the Edge Function URL changes.

## Deploy

Standard Next.js app — deploys as-is to Vercel, Netlify, or any Node host:

```bash
npm run build
npm start
```

Set all four env vars in your hosting platform's dashboard for production. All are
`NEXT_PUBLIC_*`, so they're bundled into the client — that's expected and safe (anon/publishable
keys are meant to be public; each Supabase project's Row Level Security policies are what
actually protect its data).

## Architecture notes

- **SSR & route protection** — `lib/auth.ts` (`getSession`, `requireRole`) runs on the server;
  the `(admin)` and `(faculty)` route groups each have a layout that calls `requireRole()` before
  rendering, so a wrong-role or logged-out user is redirected server-side, before any page HTML
  is sent.
- **No-refresh navigation** — every internal link is a Next.js `<Link>`, client-side routed
  automatically.
- **Row Level Security** — every table has RLS enabled, with a `SELECT` policy for authenticated
  users and an `ALL` policy for admins (via a `public.is_admin()` helper). This matters most for
  `admin_users` itself: `getSession()` reads a user's own row on every page load, so that table
  needs its SELECT policy just like any other.
