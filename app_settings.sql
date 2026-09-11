-- ============================================================
-- ASES — App Settings table
-- ============================================================
-- Single-row configuration table holding branding and integration
-- values that were previously hardcoded across the app (college
-- name, department, logo, Edge Function URL). The login page is
-- intentionally excluded — it keeps its own hardcoded branding.
--
-- There is NO admin UI for this table by design. Edit the row
-- directly in the Supabase Table Editor (or via SQL) when branding
-- or the Edge Function URL needs to change.
-- ============================================================

CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  college_name text NOT NULL DEFAULT 'B. K. Birla College, Kalyan',
  college_subtitle text NOT NULL DEFAULT '(Empowered Autonomous Status)',
  department_name text NOT NULL DEFAULT 'Department of Management Studies',
  logo_url text NOT NULL DEFAULT 'https://i.ibb.co/8D6qf9gg/tl.png',
  pdf_logo_url text NOT NULL DEFAULT 'https://i.ibb.co/9m1dn3hh/IMG-20260505-WA0001-1-jpg.jpg',
  edge_function_base_url text NOT NULL DEFAULT '',
  updated_at timestamp with time zone DEFAULT now(),
  -- Enforces a single row: id can only ever be TRUE
  CONSTRAINT app_settings_singleton CHECK (id)
);

-- Seed the one and only row with the values the app currently uses,
-- so behavior is unchanged until you edit them.
INSERT INTO public.app_settings (
  id, college_name, college_subtitle, department_name, logo_url, pdf_logo_url, edge_function_base_url
) VALUES (
  true,
  'B. K. Birla College, Kalyan',
  '(Empowered Autonomous Status)',
  'Department of Management Studies',
  'https://i.ibb.co/8D6qf9gg/tl.png',
  'https://i.ibb.co/9m1dn3hh/IMG-20260505-WA0001-1-jpg.jpg',
  'https://jpmijvxdmfdmtkvfdvdq.supabase.co/functions/v1/admin-create-user'
);

-- ── Row Level Security ────────────────────────────────────────
-- Every signed-in user (admin or faculty) needs to read this table
-- (branding shows in the sidebar and PDF exports for everyone).
-- Nobody writes to it through the app — there is no frontend UI —
-- so no INSERT/UPDATE/DELETE policy is created. Edit the row via
-- the Supabase Table Editor or SQL editor, which uses the service
-- role and bypasses RLS.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);
