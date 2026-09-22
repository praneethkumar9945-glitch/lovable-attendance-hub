import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "hr" | "incharge" | "employee" | "student";

export interface RoleState {
  loading: boolean;
  roles: AppRole[];
  department: string | null;
  fullName: string | null;
  email: string;
  isHR: boolean;
  isIncharge: boolean;
  isStaff: boolean;
  isEmployee: boolean;
  isStudent: boolean;
  reload: () => void;
}

export function useRoles(): RoleState {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [department, setDepartment] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { if (!cancelled) setLoading(false); return; }
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, department").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setEmail(user.email ?? "");
      setRoles((roleRows ?? []).map((r) => r.role as AppRole));
      setDepartment(profile?.department ?? null);
      setFullName(profile?.full_name ?? (user.user_metadata?.full_name as string) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const isHR = roles.includes("hr");
  const isIncharge = roles.includes("incharge");
  return {
    loading, roles, department, fullName, email,
    isHR, isIncharge,
    isStaff: isHR || isIncharge,
    isEmployee: roles.includes("employee"),
    isStudent: roles.includes("student"),
    reload: () => setTick((t) => t + 1),
  };
}
