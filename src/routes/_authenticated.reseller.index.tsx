import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  KeyRound,
  CheckCircle2,
  Timer,
  Ban,
  Gauge,
  Infinity as InfinityIcon,
} from "lucide-react";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/reseller/")({
  head: () => ({ meta: [{ title: "Painel do Revendedor — LovConnect" }] }),
  component: ResellerDashboard,
});

interface ResellerAccount {
  company_name: string | null;
  max_licenses: number;
  used_licenses: number;
  allow_lifetime: boolean;
  trial_max_seconds: number;
  normal_max_days: number;
  valid_until: string | null;
  blocked: boolean;
}

interface LicenseRow {
  status: string;
  type: string;
}

function ResellerDashboard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["reseller-dashboard", user?.id],
    enabled: isSupabaseConfigured && Boolean(user?.id),
    queryFn: async () => {
      const [{ data: account }, { data: licenses }] = await Promise.all([
        supabase
          .from("reseller_accounts")
          .select(
            "company_name,max_licenses,used_licenses,allow_lifetime,trial_max_seconds,normal_max_days,valid_until,blocked",
          )
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase.from("licenses").select("status,type").eq("reseller_id", user!.id),
      ]);
      return {
        account: (account ?? null) as ResellerAccount | null,
        licenses: (licenses ?? []) as LicenseRow[],
      };
    },
  });

  const account = data?.account ?? null;
  const licenses = data?.licenses ?? [];
  const used = account?.used_licenses ?? licenses.length;
  const max = account?.max_licenses ?? 0;
  const remaining = Math.max(0, max - used);
  const usagePct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  const cards = [
    { label: "Licenças usadas", value: used, icon: KeyRound },
    { label: "Disponíveis", value: remaining, icon: Gauge },
    {
      label: "Ativas",
      value: licenses.filter((l) => l.status === "active").length,
      icon: CheckCircle2,
    },
    {
      label: "Testes",
      value: licenses.filter((l) => l.status === "trial" || l.type === "trial").length,
      icon: Timer,
    },
  ];

  if (!isLoading && !account) {
    return (
      <div className="space-y-6">
        <PageHeader title="Painel do Revendedor" />
        <Card className="border-border/60">
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Conta de revenda ainda não configurada</p>
            <p className="text-sm text-muted-foreground">
              Um administrador precisa criar e liberar sua conta de revenda com limites de licenças.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={account?.company_name ? account.company_name : "Painel do Revendedor"}
        description="Acompanhe seu saldo de licenças e limites."
      />

      {account?.blocked && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <Ban className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-foreground">
            Sua conta está <strong>bloqueada</strong>. Entre em contato com o administrador.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/60">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-tight text-foreground">
                    {isLoading ? "…" : c.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Uso do saldo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {used} de {max} licenças
              </span>
              <span className="font-medium text-foreground">{usagePct}%</span>
            </div>
            <Progress value={usagePct} />
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">Licenças vitalícias</dt>
              <dd className="flex items-center gap-1 font-medium text-foreground">
                <InfinityIcon className="h-4 w-4" />
                {account?.allow_lifetime ? "Permitido" : "Não permitido"}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">Dias máx. (normal)</dt>
              <dd className="font-medium text-foreground">{account?.normal_max_days ?? 0}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">Tempo máx. teste (s)</dt>
              <dd className="font-medium text-foreground">{account?.trial_max_seconds ?? 0}</dd>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">Conta válida até</dt>
              <dd className="font-medium text-foreground">{formatDate(account?.valid_until)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
