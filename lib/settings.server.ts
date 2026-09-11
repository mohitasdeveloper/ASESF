import { createClient } from '@/lib/supabase/server';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings';

/**
 * Server-side counterpart to lib/settings.ts's getAppSettings(), for
 * use in Server Components / generateMetadata where the browser
 * Supabase client isn't available. Not cached across requests (each
 * request gets a fresh server client), but this only runs for
 * metadata generation, which is infrequent.
 */
export async function getAppSettingsServer(): Promise<AppSettings> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', true).maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      college_name: data.college_name ?? DEFAULT_SETTINGS.college_name,
      college_subtitle: data.college_subtitle ?? DEFAULT_SETTINGS.college_subtitle,
      department_name: data.department_name ?? DEFAULT_SETTINGS.department_name,
      logo_url: data.logo_url ?? DEFAULT_SETTINGS.logo_url,
      pdf_logo_url: data.pdf_logo_url ?? DEFAULT_SETTINGS.pdf_logo_url,
      edge_function_base_url: data.edge_function_base_url ?? DEFAULT_SETTINGS.edge_function_base_url,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
