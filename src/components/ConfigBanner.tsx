import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

/** Shown across the app when the external Supabase env vars are missing. */
export function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">Supabase externo não configurado</p>
        <p className="text-muted-foreground">
          Preencha <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> no arquivo{" "}
          <code className="rounded bg-muted px-1">.env</code>. Veja o{" "}
          <code className="rounded bg-muted px-1">SETUP.md</code> para o passo a passo.
        </p>
      </div>
    </div>
  );
}
