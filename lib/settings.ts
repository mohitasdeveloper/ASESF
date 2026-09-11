import { createClient } from '@/lib/supabase/client';

export interface AppSettings {
  college_name: string;
  college_subtitle: string;
  department_name: string;
  logo_url: string;
  pdf_logo_url: string;
  edge_function_base_url: string;
}

/**
 * Fallback used only if the app_settings row can't be read (table not
 * migrated yet, RLS issue, network error). Keeps the app functional
 * rather than showing blank branding.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  college_name: 'B. K. Birla College, Kalyan',
  college_subtitle: '(Empowered Autonomous Status)',
  department_name: 'Department of Management Studies',
  logo_url: 'https://i.ibb.co/8D6qf9gg/tl.png',
  pdf_logo_url: 'https://i.ibb.co/9m1dn3hh/IMG-20260505-WA0001-1-jpg.jpg',
  edge_function_base_url: '',
};

let cached: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;

/**
 * ASES — App Settings (Client)
 * Reads the single `app_settings` row (college name, department,
 * logos, Edge Function URL). Cached in module scope after the first
 * successful fetch for the lifetime of the page — branding doesn't
 * change mid-session, so no need to refetch. There is no admin UI
 * to edit this table by design; edit the row directly in Supabase.
 */
export async function getAppSettings(): Promise<AppSettings> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', true).maybeSingle();
      if (error || !data) {
        cached = DEFAULT_SETTINGS;
      } else {
        cached = {
          college_name: data.college_name ?? DEFAULT_SETTINGS.college_name,
          college_subtitle: data.college_subtitle ?? DEFAULT_SETTINGS.college_subtitle,
          department_name: data.department_name ?? DEFAULT_SETTINGS.department_name,
          logo_url: data.logo_url ?? DEFAULT_SETTINGS.logo_url,
          pdf_logo_url: data.pdf_logo_url ?? DEFAULT_SETTINGS.pdf_logo_url,
          edge_function_base_url: data.edge_function_base_url ?? DEFAULT_SETTINGS.edge_function_base_url,
        };
      }
    } catch {
      cached = DEFAULT_SETTINGS;
    }
    return cached!;
  })();

  return inflight;
}

/**
 * Clear the cached branding so the next getAppSettings() call re-fetches.
 * Called when the selected department changes (lib/supabase/client.ts)
 * since each department's Supabase project has its own app_settings row
 * (college/department name, logos) and the cache is otherwise per-tab
 * for the lifetime of the page.
 */
export function resetAppSettingsCache() {
  cached = null;
  inflight = null;
}
