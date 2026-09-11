/**
 * ASES — Department / Multi-Database Registry
 *
 * One frontend, multiple Supabase projects — one per department. The
 * department the user picks on the login screen decides which Supabase
 * project (URL + anon key) every Supabase client in the app talks to.
 *
 * The chosen department is stored in a single cookie (readable by both
 * the browser and the server) so:
 *   - the browser client (lib/supabase/client.ts) knows which project
 *     to sign in against
 *   - the server client (lib/supabase/server.ts) and middleware
 *     (lib/supabase/middleware.ts) know which project to read the
 *     session/data from on every request during that browser's session
 *
 * To add another department later: add one entry below, add its two
 * env vars, and add it to the dropdown data — nothing else in the app
 * needs to change (see README.md "Adding another department").
 */

export type Dept = 'DMS' | 'DMMC';

export interface DeptConfig {
  /** Short code — also the value stored in the cookie. */
  code: Dept;
  /** Shown in the login page dropdown. */
  label: string;
  /** Shown in the login page's left branding panel when this dept is selected. */
  brandDept: string;
  url: string;
  anonKey: string;
}

export const DEPT_COOKIE = 'ases_dept';
export const DEFAULT_DEPT: Dept = 'DMS';

export const DEPARTMENTS: Record<Dept, DeptConfig> = {
  DMS: {
    code: 'DMS',
    label: 'DMS — Management Studies',
    brandDept: 'Department of Management Studies',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL_DMS ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DMS ?? '',
  },
  DMMC: {
    code: 'DMMC',
    label: 'DMMC — Multimedia & Mass Communication',
    brandDept: 'Department of Multimedia and Mass Communication',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL_DMMC ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DMMC ?? '',
  },
};

/** Ordered list for rendering the login page dropdown. */
export const DEPARTMENT_LIST: DeptConfig[] = [DEPARTMENTS.DMS, DEPARTMENTS.DMMC];

export function isValidDept(value: string | null | undefined): value is Dept {
  return value === 'DMS' || value === 'DMMC';
}

export function resolveDept(value: string | null | undefined): Dept {
  return isValidDept(value) ? value : DEFAULT_DEPT;
}

export function getDeptConfig(dept: Dept): DeptConfig {
  const config = DEPARTMENTS[dept];
  if (!config.url || !config.anonKey) {
    // Fails loudly at connection time rather than silently hitting the
    // wrong (or no) project — almost always means the two env vars for
    // this department haven't been set yet (see .env.local.example).
    console.error(
      `[ASES] Missing Supabase URL/anon key for department "${dept}". ` +
        `Check NEXT_PUBLIC_SUPABASE_URL_${dept} and NEXT_PUBLIC_SUPABASE_ANON_KEY_${dept}.`
    );
  }
  return config;
}
