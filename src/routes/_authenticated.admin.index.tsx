import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  KeyRound,
  CheckCircle2,
  Timer,
  Infinity as InfinityIcon,
  XCircle,
  Ban,
  Wifi,
  Users,
  CalendarPlus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — LovConnect" }] }),
  component: Dashboard,
});

interface LicenseRow {
  status: string;
  type: string;
  created_at: string;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const [{ data: licenses }, { count: onlineSessions }, { count: resellers }] =
        await Promise.all([
          supabase.from("licenses").select("status,type,created_at"),
          supabase
            .from("license_sessions")
            .select("id", { count: "exact", head: true })
            .eq("online", true),
          supabase
            .from("reseller_accounts")
            .select("id", { count: "exact", head: true })
            .eq("blocked", false),
        ]);
      return {
        licenses: (licenses ?? []) as LicenseRow[],
        onlineSessions: onlineSessions ?? 0,
        resellers: resellers ?? 0,
      };
    },
  });

  const licenses = data?.licenses ?? [];
  const today = startOfToday().getTime();
  const stats = {
    total: licenses.length,
    active: licenses.filter((l) => l.status === "active").length,
    trial: licenses.filter((l) => l.status === "trial" || l.type === "trial").length,
    lifetime: licenses.filter((l) => l.type === "lifetime").length,
    expired: licenses.filter((l) => l.status === "expired").length,
    revoked: licenses.filter((l) => l.status === "revoked").length,
    createdToday: licenses.filter((l) => new Date(l.created_at).getTime() >= today).length,
  };

  const chartData = (() => {
    const days: { day: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const count = licenses.filter((l) => {
        const t = new Date(l.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      days.push({ day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), count });
    }
    return days;
  })();

  const cards = [
    { label: "Total de licenças", value: stats.total, icon: KeyRound },
    { label: "Ativas", value: stats.active, icon: CheckCircle2 },
    { label: "Testes", value: stats.trial, icon: Timer },
    { label: "Vitalícias", value: stats.lifetime, icon: InfinityIcon },
    { label: "Expiradas", value: stats.expired, icon: XCircle },
    { label: "Revogadas", value: stats.revoked, icon: Ban },
    { label: "Sessões online", value: data?.onlineSessions ?? 0, icon: Wifi },
    { label: "Revendedores ativos", value: data?.resellers ?? 0, icon: Users },
    { label: "Criadas hoje", value: stats.createdToday, icon: CalendarPlus },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral das licenças LovConnect." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
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
          <CardTitle className="text-base">Licenças criadas (últimos 14 dias)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-primary)"
                fill="url(#fillCount)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
