import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QrCode, Users, ScanLine, ClipboardList, LogOut, GraduationCap, Wallet } from "lucide-react";
import PersonManager from "@/components/hr/PersonManager";
import AttendanceScanner from "@/components/hr/AttendanceScanner";
import AttendanceList from "@/components/hr/AttendanceList";
import Payroll from "@/components/hr/Payroll";
import SelfPunch from "@/components/hr/SelfPunch";
import { useRoles } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TapAttend Attendance & Payroll" },
      { name: "description", content: "Manage staff and students, scan QR punches, follow live attendance and export payroll hours." },
      { property: "og:title", content: "TapAttend Dashboard" },
      { property: "og:description", content: "Live QR attendance, student records and payroll hours in one place." },
    ],
  }),
  component: Dashboard,
});

interface TabDef { value: string; label: string; icon: React.ReactNode; content: React.ReactNode }

function Dashboard() {
  const navigate = useNavigate();
  const { loading, email, isHR, isIncharge, isEmployee, isStudent, department } = useRoles();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const tabs: TabDef[] = [];
  if (isHR || isIncharge) {
    tabs.push({ value: "staff", label: "Staff", icon: <Users className="h-4 w-4" />, content: <PersonManager kind="employee" readOnly={!isHR} /> });
    tabs.push({ value: "students", label: "Students", icon: <GraduationCap className="h-4 w-4" />, content: <PersonManager kind="student" readOnly={!isHR} /> });
    tabs.push({ value: "scanner", label: "Scanner", icon: <ScanLine className="h-4 w-4" />, content: <AttendanceScanner /> });
    tabs.push({ value: "records", label: "Records", icon: <ClipboardList className="h-4 w-4" />, content: <AttendanceList /> });
    tabs.push({ value: "payroll", label: "Payroll", icon: <Wallet className="h-4 w-4" />, content: <Payroll /> });
  } else if (isEmployee) {
    tabs.push({ value: "punch", label: "My punch", icon: <ScanLine className="h-4 w-4" />, content: <SelfPunch kind="employee" /> });
  } else if (isStudent) {
    tabs.push({ value: "punch", label: "My attendance", icon: <ScanLine className="h-4 w-4" />, content: <SelfPunch kind="student" /> });
  }

  const roleLabel = isHR ? "HR" : isIncharge ? `Incharge${department ? ` · ${department}` : ""}` : isEmployee ? "Staff" : isStudent ? "Student" : "No role yet";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-lg">TapAttend · {roleLabel}</h1>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
        ) : tabs.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No access has been set up for this account yet. Ask HR to add you, then sign up again choosing your role.
          </p>
        ) : (
          <Tabs defaultValue={tabs[0]!.value} className="w-full">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1 px-1 text-[11px] sm:gap-1.5 sm:text-sm">
                  {t.icon}<span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map(t => <TabsContent key={t.value} value={t.value} className="mt-4">{t.content}</TabsContent>)}
          </Tabs>
        )}
      </main>
    </div>
  );
}
