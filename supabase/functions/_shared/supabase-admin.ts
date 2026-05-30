import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Reads the required server-only env/secrets for the Edge Functions.
 * SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the
 * Supabase platform. SUPABASE_SERVICE_ROLE_KEY must be set with:
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
 */
export interface FnEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function readEnv(): { env: FnEnv | null; missing: string[] } {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) return { env: null, missing };
  return { env: { url, anonKey, serviceRoleKey }, missing: [] };
}

/** Admin client (service role) — bypasses RLS. Server-only. */
export function getAdminClient(env: FnEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
