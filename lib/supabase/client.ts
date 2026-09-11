'use client';

import { createBrowserClient } from '@supabase/ssr';
import { DEPT_COOKIE, type Dept, getDeptConfig, resolveDept } from './departments';

/**
 * ASES — Supabase Browser Client (multi-department)
 * Use inside Client Components / hooks. Session is kept in cookies
 * (via @supabase/ssr) so the server can read it too — this is what
 * makes real SSR + route protection possible.
 *
 * Which Supabase project (department) this talks to is decided by the
 * `ases_dept` cookie — see lib/supabase/departments.ts.
 */

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Current department, as recorded in the browser (defaults to DMS if never set). */
export function getDept(): Dept {
  return resolveDept(readCookie(DEPT_COOKIE));
}

/**
 * Record the department the user picked (login page dropdown, or right
 * before signing in). Long-lived so the dropdown can pre-select it on
 * the user's next visit. Not httpOnly — the server also needs to read
 * it (in Server Components/middleware) and it holds no secret, just a
 * project selector.
 *
 * Returns true if this actually changed the department (so callers —
 * see LoginForm.tsx — know to also invalidate any cached branding).
 */
export function setDept(dept: Dept): boolean {
  if (typeof document === 'undefined') return false;
  const changed = getDept() !== dept;
  document.cookie = `${DEPT_COOKIE}=${encodeURIComponent(dept)}; path=/; max-age=31536000; SameSite=Lax`;
  return changed;
}

export function createClient(dept: Dept = getDept()) {
  const { url, anonKey } = getDeptConfig(dept);
  return createBrowserClient(url, anonKey);
}
