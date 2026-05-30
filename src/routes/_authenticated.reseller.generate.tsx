import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Timer, KeyRound } from "lucide-react";

import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { PageHeader } from "@/components/admin/PageHeader";
import { RevealSecretDialog } from "@/components/RevealSecretDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/reseller/generate")({
  head: () => ({ meta: [{ title: "Gerar licença — LovConnect" }] }),
  component: GeneratePage,
});

type Kind = "trial" | "license";

interface GenerateResponse {
  license_key: string;
  masked_key: string;
  id: string;
  type: string;
  expires_at: string | null;
}

function GeneratePage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [trialSeconds, setTrialSeconds] = useState("3600");
  const [licenseDays, setLicenseDays] = useState("30");
  const [lifetime, setLifetime] = useState(false);
  const [submitting, setSubmitting] = useState<Kind | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);

  const generate = async (kind: Kind) => {
    setSubmitting(kind);
    try {
      const endpoint = kind === "trial" ? "generate-trial" : "generate-license";
      const body =
        kind === "trial"
          ? {
              client_name: clientName,
              client_email: clientEmail,
              trial_seconds: Number(trialSeconds) || 0,
            }
          : {
              client_name: clientName,
              client_email: clientEmail,
              type: lifetime ? "lifetime" : "normal",
              days: lifetime ? 0 : Number(licenseDays) || 0,
            };
      const result = await invokeEdge<GenerateResponse>("reseller-api", endpoint, { body });
      if (result.ok && result.data) {
        toast.success(
          kind === "trial" ? "Licença de teste gerada." : "Licença gerada com sucesso.",
        );
        setRevealed(result.data.license_key);
        setRevealOpen(true);
        setClientName("");
        setClientEmail("");
      } else {
        toast.error(edgeUnavailableMessage(result));
      }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerar licença"
        description="Emita uma licença de teste ou definitiva para o seu cliente."
      />

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        A geração de licença definitiva consome 1 do seu saldo. Testes não consomem saldo. A chave é
        exibida apenas uma vez no momento da criação.
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Dados do cliente</CardTitle>
          <CardDescription>Usados para identificar a licença emitida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="clientName">Nome do cliente</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex.: João Silva"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Email do cliente</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="cliente@exemplo.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-primary" /> Licença de teste
            </CardTitle>
            <CardDescription>Acesso temporário, medido em segundos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trialSeconds">Duração (segundos)</Label>
              <Input
                id="trialSeconds"
                type="number"
                min={1}
                value={trialSeconds}
                onChange={(e) => setTrialSeconds(e.target.value)}
              />
            </div>
            <Button
              className="w-full gap-2"
              variant="secondary"
              disabled={submitting !== null}
              onClick={() => generate("trial")}
            >
              <Timer className="h-4 w-4" />
              {submitting === "trial" ? "Gerando…" : "Gerar teste"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" /> Licença definitiva
            </CardTitle>
            <CardDescription>Validade medida em dias ou vitalícia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <Label htmlFor="lifetime" className="text-sm">
                Licença vitalícia
              </Label>
              <Switch id="lifetime" checked={lifetime} onCheckedChange={setLifetime} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseDays">Validade (dias)</Label>
              <Input
                id="licenseDays"
                type="number"
                min={1}
                value={licenseDays}
                disabled={lifetime}
                onChange={(e) => setLicenseDays(e.target.value)}
              />
            </div>
            <Button
              className="w-full gap-2"
              disabled={submitting !== null}
              onClick={() => generate("license")}
            >
              <PlusCircle className="h-4 w-4" />
              {submitting === "license" ? "Gerando…" : "Gerar licença"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <RevealSecretDialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        title="Licença gerada"
        description="Copie a chave completa agora — ela não será exibida novamente."
        secret={revealed}
      />
    </div>
  );
}
