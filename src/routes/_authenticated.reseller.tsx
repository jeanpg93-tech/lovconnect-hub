import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";
import { ResellerSidebar } from "@/components/reseller/ResellerSidebar";
import { ConfigBanner } from "@/components/ConfigBanner";

export const Route = createFileRoute("/_authenticated/reseller")({
  component: ResellerLayout,
});

function ResellerLayout() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  // Admins manage everything from the admin panel.
  useEffect(() => {
    if (!loading && role === "admin") navigate({ to: "/admin", replace: true });
  }, [loading, role, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (role !== "reseller") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-xl font-semibold text-foreground">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para revendedores.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <ResellerSidebar />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
          <ConfigBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
