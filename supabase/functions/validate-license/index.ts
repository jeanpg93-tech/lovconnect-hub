// ============================================================================
// LovConnect License Hub — validate-license  (STUB, Fase 1/2)
//
// Real validation logic ships in Fase 5. This stub already provides:
//   - Full CORS (incl. OPTIONS preflight)
//   - Env/secret reading with clear errors
//   - Health check: GET /validate-license/health
//   - Payload format validation matching the Chrome extension contract:
//       { license_key, device_id, session_id?, heartbeat? }
//     (legacy "hwid" is accepted as a fallback for device_id)
//   - A TOP-LEVEL response shape the extension reads directly (data.valid),
//     not nested inside { ok, data }.
//
// Deploy: supabase functions deploy validate-license
// Call:   POST https://<project>.supabase.co/functions/v1/validate-license
//         body: { license_key, device_id, session_id?, heartbeat? }
// ============================================================================
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { readEnv } from "../_shared/supabase-admin.ts";

const PHASE = "stub";
const VERSION = "0.1.0";

/** Top-level JSON response (extension-compatible — no { ok, data } wrapper). */
function extResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Standard "invalid" envelope the extension understands. */
function invalid(message: string, reason: string, status = 200): Response {
  return extResponse(
    {
      valid: false,
      message,
      reason,
      session_id: null,
      user_name: null,
      expires_at: null,
      activated_at: null,
      status: "stub",
      lifetime: false,
      online_count: 0,
      phase: PHASE,
    },
    status,
  );
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";

  // Health check.
  if (last === "health" || req.method === "GET") {
    const { missing } = readEnv();
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          service: "validate-license",
          phase: PHASE,
          version: VERSION,
          configured: missing.length === 0,
          missing_secrets: missing,
        },
        error: null,
        code: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return invalid("Use POST.", "method_not_allowed", 405);
  }

  const { env, missing } = readEnv();
  if (!env) {
    return invalid(
      `Secrets ausentes: ${missing.join(", ")}. Configure com 'supabase secrets set'.`,
      "missing_secrets",
      500,
    );
  }

  // Parse + validate the extension payload.
  let payload: {
    license_key?: unknown;
    device_id?: unknown;
    hwid?: unknown;
    session_id?: unknown;
    heartbeat?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return invalid("Corpo JSON inválido.", "invalid_json", 400);
  }

  const licenseKey = typeof payload.license_key === "string" ? payload.license_key.trim() : "";
  // device_id is the primary field; hwid is accepted as a legacy fallback.
  const deviceId =
    typeof payload.device_id === "string" && payload.device_id.trim()
      ? payload.device_id.trim()
      : typeof payload.hwid === "string"
        ? payload.hwid.trim()
        : "";

  if (!licenseKey) {
    return invalid("Campo 'license_key' obrigatório.", "missing_license_key", 400);
  }
  if (!deviceId) {
    return invalid("Campo 'device_id' obrigatório.", "missing_device_id", 400);
  }

  // STUB response — top-level shape mirrors the real Fase 5 contract so the
  // extension can integrate against it now without breaking.
  return invalid("Validação real disponível na próxima fase.", "stub");
});
