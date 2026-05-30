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

export const Route = createFileRoute("/_authenticated/admin/versions")({
  head: () => ({ meta: [{ title: "Versões — LovConnect" }] }),
  component: VersionsPage,
});

interface Version {
  id: string;
  version: string;
  changelog: string | null;
  download_url: string | null;
  is_active: boolean;
  created_at: string;
}

function VersionsPage() {
  const qc = useQueryClient();
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["versions"],
    enabled: isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extension_versions")
        .select("id,version,changelog,download_url,is_active,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!version.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("extension_versions")
      .insert({ version, changelog, download_url: downloadUrl || null });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Versão cadastrada.");
      setVersion("");
      setChangelog("");
      setDownloadUrl("");
      void qc.invalidateQueries({ queryKey: ["versions"] });
    }
  };

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Versões" description="Controle de versões da extensão LovConnect." />

      <Card className="max-w-2xl border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Nova versão</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ver">Versão</Label>
                <Input id="ver" placeholder="1.0.0" value={version} onChange={(e) => setVersion(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">URL de download</Label>
                <Input id="url" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clog">Changelog</Label>
              <Textarea id="clog" value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={3} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Cadastrar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma versão cadastrada.</p>
        )}
        {rows.map((v) => (
          <Card key={v.id} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono font-medium text-foreground">v{v.version}</p>
                <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
              </div>
              {v.changelog && <p className="mt-1 text-sm text-muted-foreground">{v.changelog}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
