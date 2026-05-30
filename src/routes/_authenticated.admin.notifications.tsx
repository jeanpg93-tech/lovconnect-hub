import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Notificações — LovConnect" }] }),
  component: NotificationsPage,
});

interface Notification {
  id: string;
  title: string;
  body: string | null;
  active: boolean;
  created_at: string;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,active,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("notifications").insert({ title, body });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Notificação criada.");
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Notificações" description="Mensagens exibidas na extensão." />

      <Card className="max-w-2xl border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Nova notificação</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ntitle">Título</Label>
              <Input id="ntitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nbody">Mensagem</Label>
              <Textarea id="nbody" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Criar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma notificação.</p>
        )}
        {rows.map((n) => (
          <Card key={n.id} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{n.title}</p>
                <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
              </div>
              {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
