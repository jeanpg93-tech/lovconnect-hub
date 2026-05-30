import { supabase, functionsBaseUrl, isSupabaseConfigured } from "@/integrations/supabase/client";

export interface EdgeResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
  /** Endpoint exists but its logic ships in a later phase. */
  notImplemented: boolean;
  /** Supabase env not configured in the frontend. */
  notConfigured: boolean;
}

/**
 * Invokes a LovConnect Edge Function on the external Supabase project.
 * `path` is appended to the function name, e.g. invokeEdge("reseller-api", "status").
 * Returns a normalized result so the UI can show "próxima fase" gracefully.
 */
export async function invokeEdge<T = unknown>(
  fn: "reseller-api" | "validate-license",
  path = "",
  options: { method?: string; body?: unknown } = {},
): Promise<EdgeResult<T>> {
  if (!isSupabaseConfigured || !functionsBaseUrl) {
    return {
      ok: false,
      data: null,
      error: "Supabase não configurado. Preencha o .env (veja SETUP.md).",
      code: "NOT_CONFIGURED",
      notImplemented: false,
      notConfigured: true,
    };
  }

  const url = `${functionsBaseUrl}/${fn}${path ? `/${path}` : ""}`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? anonKey;

  try {
    const res = await fetch(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let json: { ok?: boolean; data?: T; error?: string; code?: string } = {};
    try {
      json = await res.json();
    } catch {
      // ignore non-JSON
    }

    return {
      ok: Boolean(json.ok),
      data: (json.data as T) ?? null,
      error: json.error ?? (res.ok ? null : `HTTP ${res.status}`),
      code: json.code ?? null,
      notImplemented: res.status === 501 || json.code === "NOT_IMPLEMENTED",
      notConfigured: json.code === "MISSING_SECRETS",
    };
  } catch (e) {
    return {
      ok: false,
      data: null,
      error: e instanceof Error ? e.message : "Falha de rede ao chamar a função.",
      code: "NETWORK_ERROR",
      notImplemented: false,
      notConfigured: false,
    };
  }
}

/** Shows a clear toast-friendly message for unavailable backend actions. */
export function edgeUnavailableMessage(result: EdgeResult): string {
  if (result.notConfigured) {
    return result.code === "MISSING_SECRETS"
      ? "Edge Function sem secrets. Configure SUPABASE_SERVICE_ROLE_KEY (SETUP.md)."
      : "Supabase não configurado. Preencha o .env (SETUP.md).";
  }
  if (result.notImplemented) {
    return "Função disponível na próxima fase.";
  }
  return result.error ?? "Não foi possível concluir a ação.";
}
