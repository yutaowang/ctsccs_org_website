import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/types";

type AuthValue = { session: Session | null; role: AppRole | null; teacherId: number | null; loading: boolean; signIn: (email: string, password: string) => Promise<string | null>; signOut: () => Promise<void>; refreshRole: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRole = async (next: Session | null) => {
    if (!next) { setRole(null); setTeacherId(null); return; }
    const { data } = await supabase.from("user_roles").select("role, teacher_id").eq("user_id", next.user.id).maybeSingle();
    setRole((data?.role as AppRole) || "sccs_family_role"); setTeacherId(data?.teacher_id || null);
  };
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadRole(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); void loadRole(next); setLoading(false); });
    return () => listener.subscription.unsubscribe();
  }, []);
  const value = useMemo<AuthValue>(() => ({
    session, role, teacherId, loading,
    signIn: async (email, password) => {
      if (!configured) return "Set the Expo Supabase environment variables first. / 请先配置 Expo Supabase 环境变量。";
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error?.message || null;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refreshRole: async () => loadRole(session),
  }), [session, role, teacherId, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
