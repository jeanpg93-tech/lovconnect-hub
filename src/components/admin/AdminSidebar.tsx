import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  KeyRound,
  PlusCircle,
  Users,
  UserCheck,
  Webhook,
  Bell,
  Package,
  LogOut,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/approvals", label: "Aprovações", icon: UserCheck },
  { to: "/admin/licenses", label: "Licenças", icon: KeyRound },
  { to: "/admin/create-license", label: "Criar licença", icon: PlusCircle },
  { to: "/admin/resellers", label: "Revendedores", icon: Users },
  { to: "/admin/tokens", label: "Tokens de API", icon: Webhook },
  { to: "/admin/notifications", label: "Notificações", icon: Bell },
  { to: "/admin/versions", label: "Versões", icon: Package },
] as const;

export function AdminSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-sidebar-foreground">LovConnect</p>
          <p className="text-xs text-muted-foreground">License Hub</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active =
            item.to === "/admin" ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <p className="truncate px-2 pb-2 text-xs text-muted-foreground" title={user?.email ?? ""}>
          {user?.email}
        </p>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
