import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

export type AppRole = "admin" | "reseller";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  configured: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return null;
  const roles = data.map((r) => r.role as AppRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("reseller")) return "reseller";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string | undefined) => {
    if (!uid) {
      setRole(null);
      return;
    }
    setRole(await fetchRole(uid));
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Listener first (sync state updates only — defer Supabase calls).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => void loadRole(newSession.user.id), 0);
      } else {
        setRole(null);
      }
    });

    // Then read existing session.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRole(data.session?.user?.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    role,
    loading,
    configured: isSupabaseConfigured,
    refreshRole: async () => {
      await loadRole(session?.user?.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setRole(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
