import { createClient } from "@supabase/supabase-js";

/**
 * Supabase browser client — connects to YOUR external Supabase project.
 *
 * Fill in the values in `.env` (copy from `.env.example`):
 *   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 *
 * Only the publishable ANON key is used here. The service role key must NEVER
 * live in the frontend — it belongs exclusively to the Edge Functions.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both env vars are present. The UI uses this to show a friendly
 *  "configure your Supabase" message instead of crashing. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[LovConnect] Supabase não configurado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example e SETUP.md).",
  );
}

// Fall back to harmless placeholders so the module never throws at import time.
// Any real request will fail clearly until env vars are provided.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "public-anon-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Base URL for invoking Edge Functions (/functions/v1/<name>). */
export const functionsBaseUrl = supabaseUrl
  ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1`
  : "";
