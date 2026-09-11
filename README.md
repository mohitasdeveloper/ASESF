# ASES — Next.js (Migration in Progress)

This is the Next.js (App Router) conversion of the original vanilla-JS ASES app.
Same Supabase backend, same UI/UX, same `schema.sql` — only the frontend has moved.

## What's done (Phase 1)

- ✅ Project scaffold (Next.js 14, App Router, TypeScript)
- ✅ Supabase SSR auth (`@supabase/ssr`) — real server-side session checks via middleware,
  replacing the old client-side `requireRole()` redirect pattern
- ✅ Login page (`/`) — full port of `index.html`, including the forgot-password modal
- ✅ Shared Sidebar layout (`components/Sidebar.tsx`) — full port of `js/components/sidebar.js`,
  using Next.js `<Link>` for instant, no-refresh navigation
- ✅ Dashboard (`/dashboard`) — full port of `dashboard.html`, including live stats, the Flatpickr
  date picker, and the two live-updating lists
- ✅ Route protection: the `(admin)` and `(faculty)` route groups each have a server-side layout
  that calls `requireRole()` before rendering — wrong-role or logged-out users are redirected
  server-side, before any page HTML is sent
- 🚧 Remaining pages exist as placeholder routes (so navigation never 404s) and are scheduled
  for their migration phase — see below

## Phase 2 — Master Data (done)

- ✅ **Rooms** — full CRUD, search, sort, Excel/PDF export
- ✅ **Subjects** — full CRUD, search, sort, Excel/PDF export
- ✅ **Courses** — full CRUD (its own distinct card-based UI, matching the original)
- ✅ **CSF Mapping** — full CRUD linking Course × Subject × Faculty, with Tom Select dropdowns,
  filter-by-course/subject, search, sort, Excel/PDF export
- ✅ `lib/exportHelpers.ts` — Excel/PDF export with the college letterhead, shared across all
  export-enabled pages (dynamic-imports `xlsx`/`jspdf` so they don't bloat the initial bundle)
- ✅ `components/Toast.tsx` — shared toast notification system (replaces the repeated
  `toast()` DOM-append pattern from every original page)
- ✅ `components/TomSelectField.tsx` — reusable Tom Select wrapper for relational dropdowns

**Schema correction (from live Supabase SQL):** `rooms.capacity` added to the Rooms CRUD;
`subjects.subject_code` made required (matches its `NOT NULL UNIQUE` constraint);
`courses.year` restricted to `FY`/`SY`/`TY` and `courses.division` to `A`/`B`/`C` dropdown
(matches the live `CHECK` constraints) — the original HTML pages had drifted from the DB schema
on these points; this Next.js version now matches the database exactly.

## Phase 3 — Timetables (done)

- ✅ **Master Timetable** — the fixed weekly grid editor: day tabs (Mon–Sat), physical room ×
  time-slot grid, click-to-assign modal with cascading Tom Select (Course → Subject/Faculty via
  `course_subject_faculty`), a separate "Virtual lecture" section for flexible-time entries,
  clear-cell, and full Excel/PDF export matching the original's large-format printable layout
- ✅ **Weekly Timetable View** — read-only pivot view filterable by Course / Faculty / Room,
  Mon–Sat × time-slot grid built from `master_timetable`, virtual/flexible load section, Excel/PDF
  export
- ✅ `lib/masterTimetable.ts` — shared data layer (time slots, rooms, CSF lookup, upsert/clear)
  ported from `js/modules/masterTimetable.js`, used by the Master Timetable page

## Phase 4 — Daily Scheduling (done)

- ✅ **Daily Scheduler** — the day-of-week generator: Import-from-Master or Start-Blank flows,
  the danger-bar regenerate confirmation, the full physical + virtual grid with click-to-assign
  modal (absent/double-booked/resolved/cancelled cell states, cascading course → subject/faculty
  picker, cancel/restore/delete actions), the Faculty Remarks panel, and large-format Excel/PDF
  export — full port of `pages/daily-scheduler.html`
- ✅ **Execution Log** — click-a-cell-to-cycle-status grid (On Time → Late → Not Engaged → Not
  Marked), optimistic UI updates, stat chips, virtual lecture section, Excel/PDF export — full
  port of `pages/execution.html`

**A note on both pages:** these are the two heaviest, most stateful pages in the whole app — deep
grid state, several interacting modals, and large jsPDF/xlsx export routines. Please test them
thoroughly: generate a schedule, edit a few cells (absent/replace/cancel/restore), cycle execution
statuses, and try both exports, on real data before treating this phase as final.

## Phase 5 — Admin Tools & Faculty Portal (done, with one noted gap)

- ✅ **Leave Management** — quick "mark absent today", full leave record form, filterable/deletable
  records table — full port of `pages/leaves.html`
- ✅ **Faculty Remarks** — autocomplete faculty search, add/delete remarks, search + sort + CSV
  export — full port of `pages/remarks.html`
- ✅ **Reports** — all 10 of the original's report types are now fully ported: Daily Summary,
  Faculty Lectures, Not Engaged/Unmarked, By Course, By Subject, By Room, Rescheduled Slots, Leave
  Summary, Daily Execution Report grid (`rc1`), and the **Lecture Taken Report** (`rc2`) — the
  load-calculation report grouping scheduled/taken/late lecture counts by faculty type (full-time
  vs. visiting), with per-faculty subtotal rows and a grand total, matching the original's Excel/PDF
  export exactly. Uses a new `TomSelectMulti` component for the multi-select faculty filter.
  **Schema-drift fix**: the original's Faculty Type filter used the value `full_time` (with an
  underscore), which doesn't match your actual `faculty.faculty_type` column values (`fulltime`,
  `visiting` — no underscore) — so that filter silently matched nothing in the original. Fixed here
  to use the real column values.
- ✅ **Users** — Faculty and Admin tabs: create accounts (via the same Supabase Edge Function the
  original used), edit profiles, activate/deactivate, force password reset, change email, search/
  filter/sort, CSV export — full port of `pages/users.html`
- ✅ **Holidays** — declare/remove holidays, duplicate-date handling — full port of `pages/holidays.html`
- ✅ **Change Password** — moved to a new shared `(shared)` route group (not `(admin)`) since the
  original page is accessible to **both** admin and faculty roles, not just admins
- ✅ **Faculty Portal** — today's schedule timeline, recent executions, recent leave history, admin
  preview mode. **Bug fix from the original**: `faculty-portal.html` looked up the signed-in
  faculty member by a `user_id` column that doesn't exist in your schema (`faculty.supabase_uid`
  is the real column) — the original's email-fallback lookup masked this, but it was fragile. This
  version queries `supabase_uid` directly, matching your actual schema.

## Remaining work

| Item | Notes |
|---|---|
| Final polish pass | ✅ Done — see below |

All 17 original pages plus login are now fully ported (with the schema-drift bug fixes noted
above). Recommended before go-live: a full click-through on staging data, especially Reports
(`rc2`'s load-calculation numbers deserve a manual spot-check against the old app) and Users
(it hits your live Supabase Edge Function).

## Polish pass — what was checked

- Every `<Link>` in the sidebar resolves to a real page (no dead nav links)
- Every local `.css` import resolves to a file that exists
- Every `@/lib` and `@/components` import resolves correctly
- Every `.tsx`/`.ts` file has balanced braces/parens (35 files checked)
- Added the missing `.eslintrc.json` (present in every `create-next-app` scaffold; harmless to
  omit for `next build`, but keeps `npm run lint` working and matches standard project shape) —
  extends both `next/core-web-vitals` and `next/typescript` so the `@typescript-eslint/*` rules
  used by inline disable comments throughout the codebase actually resolve
- Moved the login page's Google Fonts `<link>` from the page body into the root layout's `<head>`,
  resolving a Next.js `no-page-custom-font` warning
- The Users page's Edge Function URL is now derived from `NEXT_PUBLIC_SUPABASE_URL` instead of
  being hardcoded — so it won't silently break if the Supabase project URL ever changes
- No stray `console.log`, `TODO`, or debug artifacts left in
- Confirmed all external hosts referenced (`i.ibb.co`, `fonts.googleapis.com`,
  `*.supabase.co`) are consistent with the `.env.local` project reference

## Known follow-ups (not bugs — just worth knowing)

- `rc2`'s load-calculation logic is genuinely intricate (see Phase 5/rc2 notes above) — spot-check
  its numbers against the old app before trusting it for anything official
- The `master_timetable` upsert in Master Timetable relies on a unique constraint on
  `(day_type, time_slot_id, room_id)` existing in your database — verify this if cell-saving
  ever throws a constraint error
- `courses.course_code` uniqueness — since `division` is now correctly restricted to A/B/C
  (previously unrestricted text), double-check existing data doesn't have course codes that
  assumed free-text divisions

## Setup

```bash
npm install
```

This app now supports **multiple departments, each its own Supabase project**, from one
frontend (see "Multi-department setup" below). `.env.local` is pre-filled with the DMS
project's URL/anon key; add the DMMC project's values too (see `.env.local.example` for the
format — copy it to `.env.local` if starting fresh).

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Deploy

This is a standard Next.js app — deploys as-is to Vercel, Netlify, or any Node host:

```bash
npm run build
npm start
```

Set all four env vars in your hosting platform's dashboard for production:
`NEXT_PUBLIC_SUPABASE_URL_DMS`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_DMS`,
`NEXT_PUBLIC_SUPABASE_URL_DMMC`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_DMMC`. All four are
`NEXT_PUBLIC_*`, so they're bundled into the client — that's expected and safe (anon/publishable
keys are meant to be public; each Supabase project's Row Level Security policies are what
actually protect its data).

## Multi-department setup (one frontend, multiple Supabase databases)

Each department is a **separate, fully independent Supabase project** — its own database, its
own users, its own data. The one Next.js frontend serves all of them; the login page's
**Department** dropdown decides which project a given browser session talks to for the rest of
that session.

**How it works** (all in `lib/supabase/`):

- `departments.ts` — the registry. Each entry has a code (`DMS`/`DMMC`), a display label, the
  branding text shown on the login page, and the two env vars to read the URL/anon key from.
  **This is the one place to touch to add another department later** — see below.
- `client.ts` / `server.ts` / `middleware.ts` — all three build their Supabase client from
  whichever department is recorded in the `ases_dept` cookie, instead of a single hardcoded
  project. Nothing elsewhere in the app changed — every page still just calls `createClient()`
  with no arguments.
- `components/LoginForm.tsx` — the dropdown. Picking a department immediately updates the
  `ases_dept` cookie (so it's remembered for next visit, before login even completes) and swaps
  the left-panel branding text. Signing in creates the Supabase client for that specific
  department and authenticates against it.

The cookie is intentionally not secret/httpOnly — it only ever holds `DMS` or `DMMC`, never
credentials. Two Supabase projects never share auth cookies (their names are derived from each
project's own URL), so a user can't accidentally land on the wrong project's session.

### Adding another department later

1. Run `supabase/new-department-setup.sql` (edit the `department_name`/logo values near the
   bottom first) against a new, empty Supabase project.
2. Add its Project URL + anon key to `.env.local` (and your hosting platform) as
   `NEXT_PUBLIC_SUPABASE_URL_<CODE>` / `NEXT_PUBLIC_SUPABASE_ANON_KEY_<CODE>`.
3. Add one entry to the `DEPARTMENTS` object and `DEPARTMENT_LIST` array in
   `lib/supabase/departments.ts`, and add `<CODE>` to the `Dept` type.

That's it — no other file needs to change.

### Known limitation

The `admin-create-user` Edge Function (used by the `/users` "Add User" screen to create
Supabase Auth accounts with the service-role key) lives outside this repo/zip — it's a Supabase
Edge Function deployed directly to the DMS project. It needs to be **deployed separately to each
new department's project**, with that project's own URL then pasted into its `app_settings.edge_function_base_url`
row. Until that's done for a department, everything else works, but "Add User" won't.

## Architecture notes

- **SSR & route protection**: `lib/auth.ts` (`getSession`, `requireRole`) runs on the server.
  `middleware.ts` refreshes the Supabase auth cookie on every request.
- **No-refresh navigation**: all internal links use Next.js `<Link>`, which is client-side
  routed automatically — no extra code needed for the smooth SPA-like feel.
- **Same UI/UX**: `app/theme.css` is the original `css/theme.css` verbatim (plus the sidebar
  styles that used to be injected by JS, now static). Page-specific `<style>` blocks from each
  original HTML file become `*.css` files next to their route.
- **Supabase**: `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (server) —
  same queries as the original `js/modules/*.js`, just called from React instead of
  `document.getElementById`. Both (plus `middleware.ts`) now resolve which of several Supabase
  *projects* to use per-request from the `ases_dept` cookie — see "Multi-department setup" above.

## Setup step: run the app_settings SQL

Before deploying, run `app_settings.sql` (in the project root) in the **DMS** Supabase project's
SQL editor. This creates a single-row `app_settings` table holding the college name, subtitle,
department name, logos, and Edge Function base URL — everything that used to be hardcoded across
the app now reads from this table instead. It's seeded with your current values, so nothing
changes visually until you edit the row.

For DMMC (or any additional department), `app_settings` is already included as part of
`supabase/new-department-setup.sql` — no separate step needed.

**There is no admin UI for this table by design** (as requested) — edit the row directly in the
Supabase Table Editor or via SQL when branding or the Edge Function URL changes. Every page reads
it except the login page, which intentionally keeps its own hardcoded branding.

## Reports — rebuilt to match the original exactly

The Reports page was substantially rebuilt this round to match `pages/reports.html`'s logic and
format precisely, fixing several real discrepancies from the earlier version:

- **Daily Summary (`r1`) and Daily Execution Report (`rc1`)** now correctly query from
  `daily_schedule` with a left-joined `lecture_execution`, so lectures that have never been marked
  still show up (as "Not Marked"). The previous version queried `lecture_execution` directly,
  which silently omitted any lecture nobody had touched yet.
- **`rc1` is now a real grid** (time slots × rooms, color-coded by status, with a Virtual Lecture
  section and Faculty Remarks panel below) instead of a flat table.
- **Status badges** now use the original's dedicated classes (`badge-on-time`, `badge-late`,
  `badge-not-engaged`, `badge-not-marked`) instead of a single generic badge style.
- **Modification flags** now render as the original's `⏱Time` / `🚪Room` / `👤Repl` badges instead
  of plain comma-joined text.
- **Every report table is now sortable by clicking any column header** (ascending/descending,
  matching the original's uniform sort behavior) via the new shared `ReportTable` component.
- **`r5` (By Subject)** now has the Faculty and Status filters the original has, which the earlier
  version was missing.
- **`r8` (Not Engaged/Unmarked)** now correctly attributes a replaced lecture to the *original*
  faculty (who was actually not engaged), not the substitute — the earlier version always showed
  the substitute.
- **`r3` (Leave Summary)** now shows the original's per-faculty leave-type breakdown (chips per
  leave type with counts) instead of a single flattened total, and its PDF export is back to being
  its own custom-built document (matching the original) rather than the generic report PDF.
- All data-fetching logic now lives in `lib/reportsData.ts`, ported function-for-function from
  `js/modules/reports.js` (`getFilteredReport`, `getFacultyLeaveSummary`, `getDailyStats`,
  `getDailyFullTable`, `getRescheduledSlots`), rather than being reimplemented inline per report.

## Hardcoded values removed (except login page)

Per request, nothing outside the login page hardcodes the college name, subtitle, department name,
logos, or the Edge Function URL anymore — each Supabase project's own `app_settings` row drives
all of that for pages after login. The login page itself still doesn't query the database for
branding (by design, so it renders instantly with no loading flash); it now picks the department
name shown in the left panel from the small static map in `lib/supabase/departments.ts` based on
the dropdown, rather than a single hardcoded string:

- `lib/settings.ts` — client-side loader, cached after first fetch (`getAppSettings()`)
- `lib/settings.server.ts` — server-side counterpart, used only by `app/layout.tsx`'s
  `generateMetadata()` for the page title/favicon
- Updated to use settings: `Sidebar.tsx`, `lib/exportHelpers.ts` (used by every Excel/PDF export on
  Rooms/Subjects/CSF Mapping/most Reports), Master Timetable, Weekly Timetable, Daily Scheduler,
  Execution Log, and Reports' `r3`/`rc1`/`rc2` custom PDF builders, and the Users page's Edge
  Function call
- **Left untouched (intentionally)**: `app/page.tsx` and `components/LoginForm.tsx` — the login
  page keeps its own hardcoded branding, as requested
