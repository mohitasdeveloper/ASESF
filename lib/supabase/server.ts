import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { DEPT_COOKIE, getDeptConfig, resolveDept } from './departments';

/**
 * ASES — Supabase Server Client (multi-department)
 * Use inside Server Components, Server Actions, and Route Handlers.
 * Reads/writes the auth cookie so SSR pages know who's logged in
 * before any HTML reaches the browser.
 *
 * Reads the `ases_dept` cookie (set on the login page) to decide which
 * Supabase project this request talks to — see lib/supabase/departments.ts.
 */
export function createClient() {
  const cookieStore = cookies();
  const dept = resolveDept(cookieStore.get(DEPT_COOKIE)?.value);
  const { url, anonKey } = getDeptConfig(dept);

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component — middleware handles refresh instead.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Called from a Server Component — middleware handles refresh instead.
        }
      },
    },
  });
}
