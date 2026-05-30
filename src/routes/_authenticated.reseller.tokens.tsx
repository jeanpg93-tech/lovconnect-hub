import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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

export const Route = createFileRoute("/_authenticated/reseller/tokens")({
  head: () => ({ meta: [{ title: "Meus tokens — LovConnect" }] }),
  component: ResellerTokensPage,
});

interface Token {
  id: string;
  name: string | null;
  token_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
}

function ResellerTokensPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["reseller-tokens", user?.id],
    enabled: isSupabaseConfigured && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_tokens")
        .select("id,name,token_prefix,last_used_at,revoked,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Token[];
    },
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus tokens"
        description="Tokens de API para integrar sua revenda (apenas prefixo é exibido)."
      />

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        A criação e revogação de tokens via painel ficam disponíveis na próxima fase. Por segurança,
        o valor completo do token é exibido apenas uma vez na geração.
      </div>

      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
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
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhum token gerado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.token_prefix}••••</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(t.last_used_at)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        t.revoked
                          ? "rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-xs text-destructive"
                          : "rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs text-success"
                      }
                    >
                      {t.revoked ? "Revogado" : "Ativo"}
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
