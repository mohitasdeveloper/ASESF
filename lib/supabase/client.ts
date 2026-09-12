'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
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

// @supabase/ssr's createBrowserClient() caches ONE client globally per tab
// (its `isSingleton` option, on by default) and ignores the url/anonKey on
// every call after the first. That's fine for a single-project app, but
// here it means: sign in to DMMC, then switch to DMS in the same tab
// without a full reload, and every later createClient('DMS') silently
// hands back the *already-cached DMMC client* — so sign-in quietly hits
// the wrong project's auth server, the DMS session never actually gets
// set, and /api/whoami (correctly checking DMS via the ases_dept cookie)
// reports "Account profile not found or inactive" even though the row is
// fine. A full refresh "fixes" it only because it wipes this in-memory
// cache. We keep our own cache instead — one real client per department —
// and disable the library's own singleton so it can't override it.
const clientsByDept = new Map<Dept, SupabaseClient>();

export function createClient(dept: Dept = getDept()) {
  const cached = clientsByDept.get(dept);
  if (cached) return cached;

  const { url, anonKey } = getDeptConfig(dept);
  const client = createBrowserClient(url, anonKey, { isSingleton: false });
  clientsByDept.set(dept, client);
  return client;
}
