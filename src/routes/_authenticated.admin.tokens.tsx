import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Ban } from "lucide-react";

import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { RevealSecretDialog } from "@/components/RevealSecretDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/tokens")({
  head: () => ({ meta: [{ title: "Tokens de API — LovConnect" }] }),
  component: TokensPage,
});

interface Token {
  id: string;
  name: string | null;
  token_prefix: string;
  last_used_at: string | null;
  revoked: boolean;
  created_at: string;
}

function TokensPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-api-tokens"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const result = await invokeEdge<{ tokens: Token[] }>("reseller-api", "list-tokens");
      if (!result.ok) throw new Error(edgeUnavailableMessage(result));
      return result.data?.tokens ?? [];
    },
  });

  const rows = data ?? [];

  const createToken = async () => {
    setCreating(true);
    try {
      const result = await invokeEdge<{ token: string }>("reseller-api", "create-token", {
        body: { name: tokenName },
      });
      if (result.ok && result.data) {
        toast.success("Token criado com sucesso.");
        setCreateOpen(false);
        setTokenName("");
        setRevealed(result.data.token);
        setRevealOpen(true);
        void refetch();
      } else {
        toast.error(edgeUnavailableMessage(result));
      }
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    setRevokingId(id);
    try {
      const result = await invokeEdge("reseller-api", "revoke-token", { body: { token_id: id } });
      if (result.ok) {
        toast.success("Token revogado.");
        void refetch();
      } else {
        toast.error(edgeUnavailableMessage(result));
      }
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokens de API"
        description="Tokens de revenda (apenas prefixo + hash são armazenados)."
        actions={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Criar token
          </Button>
        }
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
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
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Revogar token"
                      disabled={t.revoked || revokingId === t.id}
                      onClick={() => revokeToken(t.id)}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border/60">
          <DialogHeader>
            <DialogTitle>Criar token de API</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar onde este token será usado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tokenName">Nome do token</Label>
            <Input
              id="tokenName"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="Ex.: Integração interna"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createToken} disabled={creating}>
              {creating ? "Criando…" : "Criar token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RevealSecretDialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        title="Token criado"
        description="Copie o token completo agora — ele não será exibido novamente."
        secret={revealed}
      />
    </div>
  );
}
