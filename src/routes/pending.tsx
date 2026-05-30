import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Clock, ShieldX, LogOut } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/pending")({
  head: () => ({ meta: [{ title: "Aguardando aprovação — LovConnect" }] }),
  component: PendingPage,
});

function PendingPage() {
  const { user, role, status, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
    } else if (role === "admin") {
      navigate({ to: "/admin", replace: true });
    } else if (role === "reseller") {
      navigate({ to: "/reseller", replace: true });
    }
  }, [loading, user, role, navigate]);

  const rejected = status === "rejected";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/60 shadow-[var(--shadow-elegant)]">
        <CardHeader className="space-y-2 text-center">
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${
              rejected ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            }`}
          >
            {rejected ? <ShieldX className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </div>
          <CardTitle className="text-2xl">
            {rejected ? "Acesso recusado" : "Aguardando aprovação"}
          </CardTitle>
          <CardDescription>
            {rejected
              ? "Sua conta não foi aprovada pelo administrador."
              : "Sua conta foi criada e aguarda a aprovação de um administrador. Você receberá acesso assim que for liberado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Conectado como <span className="font-medium text-foreground">{user?.email}</span>
          </p>
          <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
