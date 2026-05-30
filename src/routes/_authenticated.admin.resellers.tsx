import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw } from "lucide-react";

import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/admin/resellers")({
  head: () => ({ meta: [{ title: "Revendedores — LovConnect" }] }),
  component: ResellersPage,
});

interface Reseller {
  id: string;
  user_id: string;
  company_name: string | null;
  max_licenses: number;
  used_licenses: number;
  remaining: number;
  allow_lifetime: boolean;
  trial_max_seconds: number;
  normal_max_days: number;
  blocked: boolean;
  valid_until: string | null;
  email: string | null;
  full_name: string | null;
}

interface EditState {
  company_name: string;
  max_licenses: string;
  trial_max_seconds: string;
  normal_max_days: string;
  valid_until: string;
  allow_lifetime: boolean;
  blocked: boolean;
}

/** ISO -> yyyy-MM-dd for date input. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ResellersPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-resellers"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const result = await invokeEdge<{ resellers: Reseller[] }>(
        "reseller-api",
        "admin-list-resellers",
      );
      if (!result.ok) throw new Error(edgeUnavailableMessage(result));
      return result.data?.resellers ?? [];
    },
  });

  const rows = data ?? [];

  const [editing, setEditing] = useState<Reseller | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [recalcId, setRecalcId] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        company_name: editing.company_name ?? "",
        max_licenses: String(editing.max_licenses ?? 0),
        trial_max_seconds: String(editing.trial_max_seconds ?? 0),
        normal_max_days: String(editing.normal_max_days ?? 0),
        valid_until: toDateInput(editing.valid_until),
        allow_lifetime: Boolean(editing.allow_lifetime),
        blocked: Boolean(editing.blocked),
      });
    } else {
      setForm(null);
    }
  }, [editing]);

  const save = async () => {
    if (!editing || !form) return;
    setSaving(true);
    try {
      const result = await invokeEdge("reseller-api", "admin-update-reseller", {
        body: {
          account_id: editing.id,
          user_id: editing.user_id,
          company_name: form.company_name,
          max_licenses: Number(form.max_licenses) || 0,
          trial_max_seconds: Number(form.trial_max_seconds) || 0,
          normal_max_days: Number(form.normal_max_days) || 0,
          valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
          allow_lifetime: form.allow_lifetime,
          blocked: form.blocked,
        },
      });
      if (result.ok) {
        toast.success("Revendedor atualizado.");
        setEditing(null);
        void refetch();
      } else {
        toast.error(edgeUnavailableMessage(result));
      }
    } finally {
      setSaving(false);
    }
  };

  const recalc = async (r: Reseller) => {
    setRecalcId(r.id);
    try {
      const result = await invokeEdge("reseller-api", "admin-recalc-usage", {
        body: { user_id: r.user_id },
      });
      if (result.ok) {
        toast.success("Uso recalculado.");
        void refetch();
      } else {
        toast.error(edgeUnavailableMessage(result));
      }
    } finally {
      setRecalcId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revendedores"
        description="Contas de revenda, limites e validade."
      />
      <Card className="border-border/60">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Vitalícia</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum revendedor cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.company_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{r.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.used_licenses}/{r.max_licenses}{" "}
                    <span className="text-muted-foreground">(resta {r.remaining})</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.allow_lifetime ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.valid_until)}
                  </TableCell>
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Recalcular uso"
                        disabled={recalcId === r.id}
                        onClick={() => recalc(r)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="border-border/60">
          <DialogHeader>
            <DialogTitle>Editar revendedor</DialogTitle>
            <DialogDescription>
              {editing?.email ?? editing?.full_name ?? "Conta de revenda"}
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Nome da empresa</Label>
                <Input
                  id="company_name"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max_licenses">Máx. de licenças</Label>
                  <Input
                    id="max_licenses"
                    type="number"
                    min={0}
                    value={form.max_licenses}
                    onChange={(e) => setForm({ ...form, max_licenses: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="normal_max_days">Dias máx. (normal)</Label>
                  <Input
                    id="normal_max_days"
                    type="number"
                    min={0}
                    value={form.normal_max_days}
                    onChange={(e) => setForm({ ...form, normal_max_days: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial_max_seconds">Tempo máx. teste (s)</Label>
                  <Input
                    id="trial_max_seconds"
                    type="number"
                    min={0}
                    value={form.trial_max_seconds}
                    onChange={(e) => setForm({ ...form, trial_max_seconds: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valid_until">Conta válida até</Label>
                  <Input
                    id="valid_until"
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <Label htmlFor="allow_lifetime" className="text-sm">
                  Permitir licenças vitalícias
                </Label>
                <Switch
                  id="allow_lifetime"
                  checked={form.allow_lifetime}
                  onCheckedChange={(v) => setForm({ ...form, allow_lifetime: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <Label htmlFor="blocked" className="text-sm">
                  Conta bloqueada
                </Label>
                <Switch
                  id="blocked"
                  checked={form.blocked}
                  onCheckedChange={(v) => setForm({ ...form, blocked: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
