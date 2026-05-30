import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/resellers")({
  head: () => ({ meta: [{ title: "Revendedores — LovConnect" }] }),
  component: ResellersPage,
});

interface Reseller {
  id: string;
  company_name: string | null;
  max_licenses: number;
  used_licenses: number;
  allow_lifetime: boolean;
  blocked: boolean;
  valid_until: string | null;
}

function ResellersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["resellers"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_accounts")
        .select("id,company_name,max_licenses,used_licenses,allow_lifetime,blocked,valid_until")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reseller[];
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revendedores"
        description="Contas de revenda, limites e validade. Edição completa na próxima fase."
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Vitalícia</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum revendedor cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.company_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.used_licenses}/{r.max_licenses}{" "}
                    <span className="text-muted-foreground">
                      (resta {Math.max(0, r.max_licenses - r.used_licenses)})
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{r.allow_lifetime ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.valid_until)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        r.blocked
                          ? "rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-xs text-destructive"
                          : "rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs text-success"
                      }
                    >
                      {r.blocked ? "Bloqueado" : "Ativo"}
                    </span>
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
