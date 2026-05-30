// ============================================================================
// LovConnect License Hub — reseller-api  (Fase 4 — REAL)
//
// Single Edge Function with endpoint routing. Two auth modes:
//   - x-api-token: rsl_...        (external reseller integrations)
//   - Authorization: Bearer <jwt> (logged-in panel users)
//
// All sensitive writes run here with the service role. Licenses/tokens are
// generated with secure crypto; only their HASH + a short prefix/mask are
// stored. The full secret is returned exactly once, at creation.
//
// Deploy: supabase functions deploy reseller-api
// Call:   POST https://<project>.supabase.co/functions/v1/reseller-api/<endpoint>
// ============================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handlePreflight } from "../_shared/cors.ts";
import { fail, ok } from "../_shared/json.ts";
import { getAdminClient, readEnv } from "../_shared/supabase-admin.ts";
import { resolveCaller, type Caller } from "../_shared/auth.ts";
import {
  generateApiToken,
  generateLicenseKey,
  generateTrialKey,
  keyPrefix,
  maskKey,
  sha256Hex,
} from "../_shared/crypto.ts";

const VERSION = "1.0.0";

const ENDPOINTS = [
  "status",
  "generate-trial",
  "generate-license",
  "list-licenses",
  "reset-hwid",
  "revoke-license",
  "delete-license",
  "create-token",
  "list-tokens",
  "revoke-token",
  // admin reseller management
  "admin-list-resellers",
  "admin-update-reseller",
  "admin-recalc-usage",
] as const;

interface Ctx {
  admin: SupabaseClient;
  caller: Caller;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function recalcUsage(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from("licenses")
    .select("id", { count: "exact", head: true })
    .eq("reseller_id", userId)
    .in("type", ["normal", "lifetime"]);
  const used = count ?? 0;
  await admin.from("reseller_accounts").update({ used_licenses: used }).eq("user_id", userId);
  return used;
}

async function audit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

async function loadAccount(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("reseller_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/**
 * Resolve a license either by `license_id` (UUID) or by `license_key`
 * (full key — hashed and matched against license_key_hash).
 * Returns the row id plus the columns the caller asked for.
 */
async function findLicense(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  columns: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const id = str(body.license_id);
  const key = str(body.license_key);
  if (!id && !key) return { row: null, error: "MISSING_ID" };

  let query = admin.from("licenses").select(columns);
  if (id) {
    query = query.eq("id", id);
  } else {
    const hash = await sha256Hex(key!);
    query = query.eq("license_key_hash", hash);
  }
  const { data } = await query.maybeSingle();
  return { row: (data as Record<string, unknown>) ?? null, error: null };
}

// ---------------------------------------------------------------------------
// endpoint handlers
// ---------------------------------------------------------------------------
async function hStatus({ admin, caller }: Ctx): Promise<Response> {
  if (caller.role === "admin" && !caller.viaToken) {
    const account = await loadAccount(admin, caller.userId);
    if (!account) return ok({ role: "admin", is_admin: true, account: null });
  }
  const account = await loadAccount(admin, caller.userId);
  if (!account) {
    return fail("Conta de revenda não configurada. Contate o administrador.", "NO_RESELLER_ACCOUNT", 404);
  }
  const used = await recalcUsage(admin, caller.userId);
  const max = account.max_licenses ?? 0;
  return ok({
    role: caller.role,
    company_name: account.company_name,
    max_licenses: max,
    used_licenses: used,
    remaining: Math.max(0, max - used),
    allow_lifetime: account.allow_lifetime,
    trial_max_seconds: account.trial_max_seconds,
    normal_max_days: account.normal_max_days,
    valid_until: account.valid_until,
    blocked: account.blocked,
  });
}

async function hGenerateTrial({ admin, caller, body }: Ctx): Promise<Response> {
  const clientName = str(body.client_name);
  const clientEmail = str(body.client_email);
  // Accept trial_seconds, minutes and seconds (API doc compatibility).
  const trialSeconds =
    num(body.trial_seconds) + num(body.minutes) * 60 + num(body.seconds);
  const targetReseller = caller.role === "admin" ? (str(body.reseller_user_id) ?? null) : caller.userId;

  if (trialSeconds <= 0) return fail("Informe a duração do teste (trial_seconds, minutes ou seconds).", "INVALID_TRIAL", 400);

  if (caller.role === "reseller" || (caller.role === "admin" && targetReseller)) {
    const account = await loadAccount(admin, targetReseller!);
    if (!account) return fail("Conta de revenda não configurada.", "NO_RESELLER_ACCOUNT", 404);
    if (account.blocked) return fail("Conta de revenda bloqueada.", "BLOCKED", 403);
    if (account.valid_until && new Date(account.valid_until) < new Date())
      return fail("Conta de revenda expirada.", "ACCOUNT_EXPIRED", 403);
    if (account.trial_max_seconds > 0 && trialSeconds > account.trial_max_seconds)
      return fail(`Tempo de teste excede o máximo permitido (${account.trial_max_seconds}s).`, "TRIAL_LIMIT", 400);
  }

  const key = generateTrialKey();
  const hash = await sha256Hex(key);
  const expiresAt = new Date(Date.now() + trialSeconds * 1000).toISOString();

  const { data: lic, error } = await admin
    .from("licenses")
    .insert({
      license_key_prefix: keyPrefix(key),
      license_key_hash: hash,
      masked_key: maskKey(key),
      client_name: clientName,
      client_email: clientEmail,
      type: "trial",
      status: "trial",
      lifetime: false,
      reseller_id: targetReseller,
      created_by: caller.userId,
      expires_at: expiresAt,
    })
    .select("id,masked_key,expires_at")
    .single();

  if (error) return fail(`Falha ao gerar teste: ${error.message}`, "DB_ERROR", 500);
  await audit(admin, caller.userId, "generate-trial", "license", lic.id, { trial_seconds: trialSeconds });

  // Trial does NOT consume credit.
  return ok({ license_key: key, masked_key: lic.masked_key, id: lic.id, type: "trial", trial_seconds: trialSeconds, expires_at: lic.expires_at });
}

async function hGenerateLicense({ admin, caller, body }: Ctx): Promise<Response> {
  // Accept both type="lifetime" and lifetime=true.
  const isLifetime = body.type === "lifetime" || bool(body.lifetime);
  const type = isLifetime ? "lifetime" : "normal";
  const clientName = str(body.client_name);
  const clientEmail = str(body.client_email);
  const notes = str(body.notes);
  const targetReseller = caller.role === "admin" ? (str(body.reseller_user_id) ?? null) : caller.userId;

  // Accept duration object AND top-level days/hours/minutes/seconds.
  const dur = (body.duration ?? {}) as Record<string, unknown>;
  const days = num(body.days) || num(dur.days);
  const hours = num(body.hours) || num(dur.hours);
  const minutes = num(body.minutes) || num(dur.minutes);
  const seconds = num(body.seconds) || num(dur.seconds);
  const totalMs = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  const totalDays = totalMs / 86_400_000;

  if (type === "normal" && totalMs <= 0)
    return fail("Informe uma duração válida para a licença.", "INVALID_DURATION", 400);

  // Reseller limit enforcement (skipped for admin without a reseller target).
  if (caller.role === "reseller" || (caller.role === "admin" && targetReseller)) {
    const account = await loadAccount(admin, targetReseller!);
    if (!account) return fail("Conta de revenda não configurada.", "NO_RESELLER_ACCOUNT", 404);
    if (account.blocked) return fail("Conta de revenda bloqueada.", "BLOCKED", 403);
    if (account.valid_until && new Date(account.valid_until) < new Date())
      return fail("Conta de revenda expirada.", "ACCOUNT_EXPIRED", 403);
    if (type === "lifetime" && !account.allow_lifetime)
      return fail("Sua conta não permite licenças vitalícias.", "LIFETIME_NOT_ALLOWED", 403);
    if (type === "normal" && account.normal_max_days > 0 && totalDays > account.normal_max_days)
      return fail(`Duração excede o máximo permitido (${account.normal_max_days} dias).`, "DURATION_LIMIT", 400);

    const used = await recalcUsage(admin, targetReseller!);
    const remaining = (account.max_licenses ?? 0) - used;
    if (remaining <= 0)
      return fail("Saldo de licenças esgotado. Solicite mais ao administrador.", "NO_CREDITS", 403);
  }

  const key = generateLicenseKey();
  const hash = await sha256Hex(key);
  const expiresAt = type === "lifetime" ? null : new Date(Date.now() + totalMs).toISOString();

  const { data: lic, error } = await admin
    .from("licenses")
    .insert({
      license_key_prefix: keyPrefix(key),
      license_key_hash: hash,
      masked_key: maskKey(key),
      client_name: clientName,
      client_email: clientEmail,
      type,
      status: "active",
      lifetime: type === "lifetime",
      reseller_id: targetReseller,
      created_by: caller.userId,
      notes,
      expires_at: expiresAt,
    })
    .select("id,masked_key,type,expires_at")
    .single();

  if (error) return fail(`Falha ao gerar licença: ${error.message}`, "DB_ERROR", 500);

  if (targetReseller) await recalcUsage(admin, targetReseller);
  await audit(admin, caller.userId, "generate-license", "license", lic.id, { type, days, hours, minutes, seconds });

  return ok({ license_key: key, masked_key: lic.masked_key, id: lic.id, type: lic.type, expires_at: lic.expires_at });
}

async function hListLicenses({ admin, caller }: Ctx): Promise<Response> {
  let q = admin
    .from("licenses")
    .select("id,masked_key,client_name,client_email,type,status,expires_at,created_at")
    .order("created_at", { ascending: false });
  if (caller.role !== "admin") q = q.eq("reseller_id", caller.userId);
  const { data, error } = await q;
  if (error) return fail(error.message, "DB_ERROR", 500);
  return ok({ licenses: data ?? [] });
}

async function authorizeLicense(admin: SupabaseClient, caller: Caller, licenseId: string) {
  const { data } = await admin
    .from("licenses")
    .select("id,reseller_id,created_by,status,type")
    .eq("id", licenseId)
    .maybeSingle();
  if (!data) return { license: null, allowed: false };
  const allowed =
    caller.role === "admin" || data.reseller_id === caller.userId || data.created_by === caller.userId;
  return { license: data, allowed };
}

async function hResetHwid({ admin, caller, body }: Ctx): Promise<Response> {
  const id = str(body.license_id);
  if (!id) return fail("Informe 'license_id'.", "MISSING_ID", 400);
  const { license, allowed } = await authorizeLicense(admin, caller, id);
  if (!license) return fail("Licença não encontrada.", "NOT_FOUND", 404);
  if (!allowed) return fail("Sem permissão para esta licença.", "FORBIDDEN", 403);

  await admin.from("license_devices").delete().eq("license_id", id);
  await admin.from("license_sessions").delete().eq("license_id", id);
  await audit(admin, caller.userId, "reset-hwid", "license", id);
  return ok({ id, reset: true });
}

async function hRevokeLicense({ admin, caller, body }: Ctx): Promise<Response> {
  const id = str(body.license_id);
  if (!id) return fail("Informe 'license_id'.", "MISSING_ID", 400);
  const { license, allowed } = await authorizeLicense(admin, caller, id);
  if (!license) return fail("Licença não encontrada.", "NOT_FOUND", 404);
  if (!allowed) return fail("Sem permissão para esta licença.", "FORBIDDEN", 403);

  const { error } = await admin.from("licenses").update({ status: "revoked" }).eq("id", id);
  if (error) return fail(error.message, "DB_ERROR", 500);
  await audit(admin, caller.userId, "revoke-license", "license", id);
  return ok({ id, status: "revoked" });
}

async function hDeleteLicense({ admin, caller, body }: Ctx): Promise<Response> {
  const id = str(body.license_id);
  if (!id) return fail("Informe 'license_id'.", "MISSING_ID", 400);
  const { license, allowed } = await authorizeLicense(admin, caller, id);
  if (!license) return fail("Licença não encontrada.", "NOT_FOUND", 404);
  if (!allowed) return fail("Sem permissão para esta licença.", "FORBIDDEN", 403);
  if (license.status !== "expired" && license.status !== "revoked")
    return fail("Apenas licenças expiradas ou revogadas podem ser excluídas.", "NOT_DELETABLE", 400);

  const { error } = await admin.from("licenses").delete().eq("id", id);
  if (error) return fail(error.message, "DB_ERROR", 500);
  if (license.reseller_id) await recalcUsage(admin, license.reseller_id);
  await audit(admin, caller.userId, "delete-license", "license", id);
  return ok({ id, deleted: true });
}

async function hCreateToken({ admin, caller, body }: Ctx): Promise<Response> {
  const name = str(body.name);
  const token = generateApiToken();
  const hash = await sha256Hex(token);
  const { data, error } = await admin
    .from("api_tokens")
    .insert({
      user_id: caller.userId,
      name,
      token_prefix: keyPrefix(token, 12),
      token_hash: hash,
    })
    .select("id,name,token_prefix,created_at")
    .single();
  if (error) return fail(`Falha ao criar token: ${error.message}`, "DB_ERROR", 500);
  await audit(admin, caller.userId, "create-token", "api_token", data.id, { name });
  return ok({ token, id: data.id, name: data.name, token_prefix: data.token_prefix });
}

async function hListTokens({ admin, caller }: Ctx): Promise<Response> {
  let q = admin
    .from("api_tokens")
    .select("id,name,token_prefix,last_used_at,revoked,created_at")
    .order("created_at", { ascending: false });
  if (caller.role !== "admin") q = q.eq("user_id", caller.userId);
  const { data, error } = await q;
  if (error) return fail(error.message, "DB_ERROR", 500);
  return ok({ tokens: data ?? [] });
}

async function hRevokeToken({ admin, caller, body }: Ctx): Promise<Response> {
  const id = str(body.token_id);
  if (!id) return fail("Informe 'token_id'.", "MISSING_ID", 400);
  const { data: row } = await admin.from("api_tokens").select("id,user_id").eq("id", id).maybeSingle();
  if (!row) return fail("Token não encontrado.", "NOT_FOUND", 404);
  if (caller.role !== "admin" && row.user_id !== caller.userId)
    return fail("Sem permissão para este token.", "FORBIDDEN", 403);
  const { error } = await admin.from("api_tokens").update({ revoked: true }).eq("id", id);
  if (error) return fail(error.message, "DB_ERROR", 500);
  await audit(admin, caller.userId, "revoke-token", "api_token", id);
  return ok({ id, revoked: true });
}

// ---- admin reseller management --------------------------------------------
function requireAdmin(caller: Caller): Response | null {
  if (caller.role !== "admin" || caller.viaToken)
    return fail("Ação restrita a administradores.", "ADMIN_ONLY", 403);
  return null;
}

async function hAdminListResellers({ admin, caller }: Ctx): Promise<Response> {
  const guard = requireAdmin(caller);
  if (guard) return guard;
  const { data: accounts, error } = await admin
    .from("reseller_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, "DB_ERROR", 500);

  const ids = (accounts ?? []).map((a) => a.user_id);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,email,full_name").in("id", ids)
    : { data: [] as Array<{ id: string; email: string | null; full_name: string | null }> };
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows = (accounts ?? []).map((a) => {
    const max = a.max_licenses ?? 0;
    const used = a.used_licenses ?? 0;
    return {
      ...a,
      remaining: Math.max(0, max - used),
      email: pmap.get(a.user_id)?.email ?? null,
      full_name: pmap.get(a.user_id)?.full_name ?? null,
    };
  });
  return ok({ resellers: rows });
}

async function hAdminUpdateReseller({ admin, caller, body }: Ctx): Promise<Response> {
  const guard = requireAdmin(caller);
  if (guard) return guard;

  const accountId = str(body.account_id);
  const userId = str(body.user_id);
  if (!accountId && !userId) return fail("Informe 'account_id' ou 'user_id'.", "MISSING_ID", 400);

  const patch: Record<string, unknown> = {};
  if ("company_name" in body) patch.company_name = str(body.company_name);
  if ("max_licenses" in body) patch.max_licenses = Math.max(0, Math.floor(num(body.max_licenses)));
  if ("allow_lifetime" in body) patch.allow_lifetime = Boolean(body.allow_lifetime);
  if ("trial_max_seconds" in body) patch.trial_max_seconds = Math.max(0, Math.floor(num(body.trial_max_seconds)));
  if ("normal_max_days" in body) patch.normal_max_days = Math.max(0, Math.floor(num(body.normal_max_days)));
  if ("valid_until" in body) patch.valid_until = str(body.valid_until);
  if ("blocked" in body) patch.blocked = Boolean(body.blocked);

  if (Object.keys(patch).length === 0) return fail("Nada para atualizar.", "EMPTY_PATCH", 400);

  let target = accountId
    ? await admin.from("reseller_accounts").select("id,user_id").eq("id", accountId).maybeSingle()
    : await admin.from("reseller_accounts").select("id,user_id").eq("user_id", userId).maybeSingle();

  if (!target.data && userId) {
    const { data: created, error: insErr } = await admin
      .from("reseller_accounts")
      .insert({ user_id: userId, ...patch })
      .select("id,user_id")
      .single();
    if (insErr) return fail(insErr.message, "DB_ERROR", 500);
    target = { data: created, error: null } as typeof target;
  } else if (target.data) {
    const { error: updErr } = await admin
      .from("reseller_accounts")
      .update(patch)
      .eq("id", target.data.id);
    if (updErr) return fail(updErr.message, "DB_ERROR", 500);
  } else {
    return fail("Revenda não encontrada.", "NOT_FOUND", 404);
  }

  await audit(admin, caller.userId, "admin-update-reseller", "reseller_account", target.data!.id, patch);
  const { data: fresh } = await admin
    .from("reseller_accounts")
    .select("*")
    .eq("id", target.data!.id)
    .maybeSingle();
  return ok({ reseller: fresh });
}

async function hAdminRecalcUsage({ admin, caller, body }: Ctx): Promise<Response> {
  const guard = requireAdmin(caller);
  if (guard) return guard;
  const userId = str(body.user_id);
  if (!userId) return fail("Informe 'user_id'.", "MISSING_ID", 400);
  const used = await recalcUsage(admin, userId);
  const { data: acc } = await admin
    .from("reseller_accounts")
    .select("max_licenses")
    .eq("user_id", userId)
    .maybeSingle();
  const max = acc?.max_licenses ?? 0;
  await audit(admin, caller.userId, "admin-recalc-usage", "reseller_account", null, { user_id: userId, used });
  return ok({ user_id: userId, used, max, remaining: Math.max(0, max - used) });
}

const HANDLERS: Record<string, (ctx: Ctx) => Promise<Response>> = {
  status: hStatus,
  "generate-trial": hGenerateTrial,
  "generate-license": hGenerateLicense,
  "list-licenses": hListLicenses,
  "reset-hwid": hResetHwid,
  "revoke-license": hRevokeLicense,
  "delete-license": hDeleteLicense,
  "create-token": hCreateToken,
  "list-tokens": hListTokens,
  "revoke-token": hRevokeToken,
  "admin-list-resellers": hAdminListResellers,
  "admin-update-reseller": hAdminUpdateReseller,
  "admin-recalc-usage": hAdminRecalcUsage,
};

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const endpoint = segments[segments.length - 1] ?? "";

  // Health check — no auth required.
  if (endpoint === "health" || endpoint === "reseller-api") {
    const { missing } = readEnv();
    return ok({
      service: "reseller-api",
      phase: "live",
      version: VERSION,
      configured: missing.length === 0,
      missing_secrets: missing,
      endpoints: ENDPOINTS,
    });
  }

  const { env, missing } = readEnv();
  if (!env) {
    return fail(
      `Secrets ausentes: ${missing.join(", ")}. Configure com 'supabase secrets set'.`,
      "MISSING_SECRETS",
      500,
    );
  }
  const admin = getAdminClient(env);

  const handler = HANDLERS[endpoint];
  if (!handler) return fail(`Endpoint desconhecido: "${endpoint}".`, "UNKNOWN_ENDPOINT", 404);

  const { caller, response } = await resolveCaller(req, admin);
  if (!caller) return response!;

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  try {
    return await handler({ admin, caller, body });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erro interno.", "INTERNAL_ERROR", 500);
  }
});
