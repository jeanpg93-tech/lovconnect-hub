import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, RotateCcw, Ban, Trash2 } from "lucide-react";

import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/licenses")({
  head: () => ({ meta: [{ title: "Licenças — LovConnect" }] }),
  component: LicensesPage,
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

function LicensesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-licenses"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const result = await invokeEdge<{ licenses: License[] }>("reseller-api", "list-licenses");
      if (!result.ok) throw new Error(edgeUnavailableMessage(result));
      return result.data?.licenses ?? [];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((r) => {
      const matchStatus = status === "all" || r.status === status || r.type === status;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        r.masked_key.toLowerCase().includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        (r.client_email ?? "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data, search, status]);

  const runAction = async (endpoint: string, id: string, label: string) => {
    const result = await invokeEdge("reseller-api", endpoint, { body: { license_id: id } });
    if (result.ok) {
      toast.success(`${label} concluído.`);
      void refetch();
    } else {
      toast.message(edgeUnavailableMessage(result));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Licenças" description="Gerencie as licenças emitidas." />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por chave, nome ou email…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="trial">Testes</SelectItem>
            <SelectItem value="lifetime">Vitalícias</SelectItem>
            <SelectItem value="expired">Expiradas</SelectItem>
            <SelectItem value="revoked">Revogadas</SelectItem>
          </SelectContent>
        </Select>
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
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Resetar dispositivo"
                        onClick={() => runAction("reset-hwid", l.id, "Reset de dispositivo")}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Revogar"
                        onClick={() => runAction("revoke-license", l.id, "Revogação")}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir"
                        disabled={l.status !== "expired" && l.status !== "revoked"}
                        onClick={() => runAction("delete-license", l.id, "Exclusão")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
