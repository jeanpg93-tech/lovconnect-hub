// ============================================================================
// LovConnect License Hub — validate-license  (STUB, Fase 1/2)
//
// Real validation logic ships in Fase 5. This stub already provides:
//   - Full CORS (incl. OPTIONS preflight)
//   - Env/secret reading with clear errors
//   - Standardized JSON envelope { ok, data, error, code }
//   - Health check: GET /validate-license/health
//   - Payload format validation, responding with a structure compatible with
//     the Chrome extension, marked phase: "stub".
//
// Deploy: supabase functions deploy validate-license
// Call:   POST https://<project>.supabase.co/functions/v1/validate-license
//         body: { license_key, hwid, action? }
// ============================================================================
import { handlePreflight } from "../_shared/cors.ts";
import { fail, jsonResponse, ok } from "../_shared/json.ts";
import { readEnv } from "../_shared/supabase-admin.ts";

const PHASE = "stub";
const VERSION = "0.1.0";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";

  // Health check.
  if (last === "health" || req.method === "GET") {
    const { missing } = readEnv();
    return ok({
      service: "validate-license",
      phase: PHASE,
      version: VERSION,
      configured: missing.length === 0,
      missing_secrets: missing,
    });
  }

  if (req.method !== "POST") {
    return fail("Use POST.", "METHOD_NOT_ALLOWED", 405);
  }

  const { env, missing } = readEnv();
  if (!env) {
    return fail(
      `Secrets ausentes: ${missing.join(", ")}. Configure com 'supabase secrets set'.`,
      "MISSING_SECRETS",
      500,
    );
  }

  // Validate payload shape.
  let payload: { license_key?: unknown; hwid?: unknown; action?: unknown };
  try {
    payload = await req.json();
  } catch {
    return fail("Corpo JSON inválido.", "INVALID_JSON", 400);
  }

  const licenseKey = typeof payload.license_key === "string" ? payload.license_key.trim() : "";
  const hwid = typeof payload.hwid === "string" ? payload.hwid.trim() : "";

  if (!licenseKey) {
    return fail("Campo 'license_key' obrigatório.", "MISSING_LICENSE_KEY", 400);
  }
  if (!hwid) {
    return fail("Campo 'hwid' obrigatório.", "MISSING_HWID", 400);
  }

  // STUB response — structure mirrors the real Fase 5 contract so the
  // extension can integrate against it now.
  return jsonResponse(
    {
      ok: true,
      code: "STUB_RESPONSE",
      data: {
        phase: PHASE,
        valid: false,
        status: "unknown",
        message: "Validação real disponível na próxima fase.",
        license: null,
        expires_at: null,
        online_count: 0,
        notifications: [],
      },
    },
    200,
  );
});
