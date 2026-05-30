// ============================================================================
// LovConnect — caller identity resolution for the reseller-api Edge Function
//
// Two authentication modes:
//   1. External reseller integrations -> header `x-api-token: rsl_...`
//        Validated against api_tokens (hash match, not revoked).
//   2. Logged-in panel users -> `Authorization: Bearer <supabase access token>`
//        Validated via the Auth admin API; role resolved from user_roles.
// ============================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fail } from "./json.ts";
import { sha256Hex } from "./crypto.ts";

export type CallerRole = "admin" | "reseller";

export interface Caller {
  userId: string;
  role: CallerRole;
  /** True when authenticated through an x-api-token (external integration). */
  viaToken: boolean;
  /** api_tokens.id when authenticated via token. */
  tokenId?: string;
}

export interface ResolveResult {
  caller: Caller | null;
  /** Pre-built error Response when resolution fails. */
  response: Response | null;
}

/** Resolve who is calling. Never throws — returns a Response on failure. */
export async function resolveCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<ResolveResult> {
  const apiToken = req.headers.get("x-api-token");

  // ---- Mode 1: external reseller API token -------------------------------
  if (apiToken) {
    if (!apiToken.startsWith("rsl_")) {
      return { caller: null, response: fail("Token de API inválido.", "INVALID_API_TOKEN", 401) };
    }
    const tokenHash = await sha256Hex(apiToken);
    const { data: row, error } = await admin
      .from("api_tokens")
      .select("id,user_id,revoked")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !row) {
      return { caller: null, response: fail("Token de API inválido.", "INVALID_API_TOKEN", 401) };
    }
    if (row.revoked) {
      return { caller: null, response: fail("Token de API revogado.", "TOKEN_REVOKED", 401) };
    }

    // Best-effort last_used_at update (ignore failures).
    await admin
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    return {
      caller: { userId: row.user_id, role: "reseller", viaToken: true, tokenId: row.id },
      response: null,
    };
  }

  // ---- Mode 2: Supabase JWT (panel) --------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!jwt) {
    return {
      caller: null,
      response: fail(
        "Autenticação necessária: envie 'x-api-token' ou faça login.",
        "UNAUTHENTICATED",
        401,
      ),
    };
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { caller: null, response: fail("Sessão inválida ou expirada.", "INVALID_SESSION", 401) };
  }

  const userId = userData.user.id;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roleSet = new Set((roles ?? []).map((r) => r.role as string));
  const role: CallerRole | null = roleSet.has("admin")
    ? "admin"
    : roleSet.has("reseller")
      ? "reseller"
      : null;

  if (!role) {
    return {
      caller: null,
      response: fail("Sua conta não tem permissão de acesso.", "NO_ROLE", 403),
    };
  }

  return { caller: { userId, role, viaToken: false }, response: null };
}
