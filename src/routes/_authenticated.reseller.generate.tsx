import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Timer, KeyRound } from "lucide-react";

import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reseller/generate")({
  head: () => ({ meta: [{ title: "Gerar licença — LovConnect" }] }),
  component: GeneratePage,
});

type Kind = "trial" | "license";

function GeneratePage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [trialSeconds, setTrialSeconds] = useState("3600");
  const [licenseDays, setLicenseDays] = useState("30");
  const [submitting, setSubmitting] = useState<Kind | null>(null);

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
              days: Number(licenseDays) || 0,
            };
      const result = await invokeEdge("reseller-api", endpoint, { body });
      if (result.ok) {
        toast.success("Licença gerada com sucesso.");
        setClientName("");
        setClientEmail("");
      } else {
        toast.message(edgeUnavailableMessage(result));
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
        A geração consome 1 licença do seu saldo. A chave é exibida apenas uma vez no momento da
        criação (disponível quando a função estiver ativa).
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
            <CardDescription>Validade medida em dias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="licenseDays">Validade (dias)</Label>
              <Input
                id="licenseDays"
                type="number"
                min={1}
                value={licenseDays}
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
    </div>
  );
}
