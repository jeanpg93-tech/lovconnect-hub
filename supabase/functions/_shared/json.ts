import { corsHeaders } from "./cors.ts";

// Standardized JSON envelope: { ok, data, error, code }
export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
}

export function jsonResponse<T>(
  body: Partial<ApiEnvelope<T>>,
  status = 200,
): Response {
  const envelope: ApiEnvelope<T> = {
    ok: body.ok ?? status < 400,
    data: body.data ?? null,
    error: body.error ?? null,
    code: body.code ?? null,
  };
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function ok<T>(data: T, code: string | null = null): Response {
  return jsonResponse({ ok: true, data, code }, 200);
}

export function fail(
  error: string,
  code: string,
  status = 400,
): Response {
  return jsonResponse({ ok: false, error, code }, status);
}

/** Returned by endpoints whose logic ships in a later phase. */
export function notImplemented(endpoint: string): Response {
  return jsonResponse(
    {
      ok: false,
      error: `Endpoint "${endpoint}" disponível na próxima fase.`,
      code: "NOT_IMPLEMENTED",
    },
    501,
  );
}
