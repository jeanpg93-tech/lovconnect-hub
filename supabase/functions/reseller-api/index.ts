// ============================================================================
// LovConnect License Hub — reseller-api  (STUB, Fase 1/2)
//
// Real endpoint logic ships in Fase 4. This stub already provides:
//   - Full CORS (incl. OPTIONS preflight)
//   - Routing for every planned endpoint
//   - Env/secret reading with clear errors
//   - Standardized JSON envelope { ok, data, error, code }
//   - Health check: GET /reseller-api/health
//
// Deploy: supabase functions deploy reseller-api
// Call:   POST https://<project>.supabase.co/functions/v1/reseller-api/<endpoint>
//         header: x-api-token: rsl_xxx
// ============================================================================
import { handlePreflight } from "../_shared/cors.ts";
import { fail, notImplemented, ok } from "../_shared/json.ts";
import { readEnv } from "../_shared/supabase-admin.ts";

const PHASE = "stub";
const VERSION = "0.1.0";

// Endpoints planned for Fase 4. `true` = implemented, `false` = stubbed (501).
const ENDPOINTS: Record<string, boolean> = {
  status: false,
  "generate-trial": false,
  "generate-license": false,
  "list-licenses": false,
  "reset-hwid": false,
  "revoke-license": false,
  "delete-license": false,
};

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  // Path looks like /reseller-api/<endpoint>
  const segments = url.pathname.split("/").filter(Boolean);
  const endpoint = segments[segments.length - 1] ?? "";

  // Health check — no auth, no secrets required beyond reporting their status.
  if (endpoint === "health" || endpoint === "reseller-api") {
    const { missing } = readEnv();
    return ok({
      service: "reseller-api",
      phase: PHASE,
      version: VERSION,
      configured: missing.length === 0,
      missing_secrets: missing,
      endpoints: Object.keys(ENDPOINTS),
    });
  }

  // Ensure secrets exist before doing anything meaningful.
  const { env, missing } = readEnv();
  if (!env) {
    return fail(
      `Secrets ausentes: ${missing.join(", ")}. Configure com 'supabase secrets set'.`,
      "MISSING_SECRETS",
      500,
    );
  }

  // Auth: reseller API uses the x-api-token header (validated in Fase 4).
  const apiToken = req.headers.get("x-api-token");
  if (!apiToken) {
    return fail("Header 'x-api-token' obrigatório.", "MISSING_API_TOKEN", 401);
  }

  // Routing.
  if (!(endpoint in ENDPOINTS)) {
    return fail(`Endpoint desconhecido: "${endpoint}".`, "UNKNOWN_ENDPOINT", 404);
  }

  // All endpoints are stubbed until Fase 4.
  if (ENDPOINTS[endpoint] === false) {
    return notImplemented(endpoint);
  }

  // (Fase 4 logic will dispatch here.)
  return notImplemented(endpoint);
});
