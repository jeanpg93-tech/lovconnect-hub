import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/reseller/licenses")({
  head: () => ({ meta: [{ title: "Minhas licenças — LovConnect" }] }),
  component: ResellerLicensesPage,
});

interface License {
  id: string;
  masked_key: string;
  client_name: string | null;
  client_email: string | null;
  type: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

function ResellerLicensesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reseller-licenses", user?.id],
    enabled: isSupabaseConfigured && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses")
        .select("id,masked_key,client_name,client_email,type,status,expires_at,created_at")
        .eq("reseller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as License[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.masked_key.toLowerCase().includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        (r.client_email ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      <PageHeader title="Minhas licenças" description="Licenças que você emitiu." />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por chave, nome ou email…"
          className="pl-9"
        />
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chave</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expira</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhuma licença encontrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.masked_key}</TableCell>
                  <TableCell>
                    <div className="text-sm">{l.client_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{l.client_email ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.type === "lifetime" ? "Vitalícia" : formatDate(l.expires_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
