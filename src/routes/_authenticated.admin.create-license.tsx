import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { invokeEdge, edgeUnavailableMessage } from "@/lib/edge";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/create-license")({
  head: () => ({ meta: [{ title: "Criar licença — LovConnect" }] }),
  component: CreateLicensePage,
});

function CreateLicensePage() {
  const [type, setType] = useState("normal");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [days, setDays] = useState(30);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await invokeEdge("reseller-api", "generate-license", {
      body: {
        type,
        client_name: clientName,
        client_email: clientEmail,
        duration: { days, hours, minutes },
        notes,
      },
    });
    setSubmitting(false);
    if (result.ok) {
      toast.success("Licença criada.");
    } else {
      toast.message(edgeUnavailableMessage(result));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Criar licença"
        description="A geração segura da chave acontece na Edge Function (próxima fase)."
      />

      <Card className="max-w-2xl border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Dados da licença</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="trial">Teste</SelectItem>
                    <SelectItem value="lifetime">Vitalícia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cname">Cliente</Label>
                <Input id="cname" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cemail">Email do cliente</Label>
              <Input
                id="cemail"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>

            {type !== "lifetime" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="days">Dias</Label>
                  <Input id="days" type="number" min={0} value={days} onChange={(e) => setDays(+e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Horas</Label>
                  <Input id="hours" type="number" min={0} value={hours} onChange={(e) => setHours(+e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min">Minutos</Label>
                  <Input id="min" type="number" min={0} value={minutes} onChange={(e) => setMinutes(+e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Gerando…" : "Gerar licença"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
