import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { QrCode } from "lucide-react";
import type { AppRole } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — TapAttend Attendance & Payroll" },
      { name: "description", content: "Sign in as HR, department incharge, staff or student to record attendance with QR codes." },
      { property: "og:title", content: "Sign in — TapAttend" },
      { property: "og:description", content: "HR, department incharge, staff and student logins for QR attendance." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AppRole>("hr");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: name } },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    if (!data.session) {
      setLoading(false);
      return toast.success("Account created. Check your email to confirm, then sign in.");
    }
    const { error: claimError } = await supabase.rpc("claim_role", {
      _role: role, _full_name: name, _department: department.trim() || null,
    });
    setLoading(false);
    if (claimError) return toast.error(claimError.message);
    toast.success("Account created!");
    navigate({ to: "/dashboard", replace: true });
  }

  const needsDepartment = role === "incharge";
  const needsRecord = role === "employee" || role === "student";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent/40 via-background to-secondary p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <QrCode className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">TapAttend</CardTitle>
          <CardDescription>QR attendance for staff and students</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-3 pt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "…" : "Sign in"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3 pt-4">
                <div>
                  <Label>I am</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hr">HR (full access)</SelectItem>
                      <SelectItem value="incharge">Department incharge</SelectItem>
                      <SelectItem value="employee">Staff member</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Full name</Label><Input required value={name} onChange={e => setName(e.target.value)} /></div>
                {needsDepartment && (
                  <div><Label>Department</Label><Input required value={department} onChange={e => setDepartment(e.target.value)} /></div>
                )}
                <div><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div>
                {needsRecord && (
                  <p className="text-xs text-muted-foreground">Use the same email HR used when adding you, so your record links automatically.</p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "…" : "Create account"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
