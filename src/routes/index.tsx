import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
    } else if (role === "admin") {
      navigate({ to: "/admin", replace: true });
    } else if (role === "reseller") {
      navigate({ to: "/reseller", replace: true });
    } else {
      // Logged in but no role yet → awaiting admin approval.
      navigate({ to: "/pending", replace: true });
    }
  }, [loading, user, role, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}
