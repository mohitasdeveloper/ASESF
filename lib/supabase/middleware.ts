import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEPT_COOKIE, getDeptConfig, resolveDept } from './departments';

/**
 * ASES — Middleware Session Refresh (multi-department)
 * Keeps the Supabase auth cookie fresh on every navigation so
 * Server Components always see an up-to-date session (mirrors the
 * old session.js autoRefreshToken behavior, but works server-side).
 *
 * Reads the `ases_dept` cookie to decide which Supabase project this
 * request's session belongs to — see lib/supabase/departments.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const dept = resolveDept(request.cookies.get(DEPT_COOKIE)?.value);
  const { url, anonKey } = getDeptConfig(dept);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
