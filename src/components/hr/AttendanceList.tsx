import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileSpreadsheet, RefreshCw, LogIn, LogOut, UserRound, Radio } from "lucide-react";

export interface AttRow {
  id: string;
  kind: "Staff" | "Student";
  punch_type: "in" | "out";
  punched_at: string;
  code: string;
  name: string;
  department: string | null;
  photo_url: string | null;
  snapshot_url: string | null;
}

export async function fetchRows(from: string, to: string): Promise<AttRow[]> {
  const start = new Date(from + "T00:00:00").toISOString();
  const end = new Date(to + "T23:59:59").toISOString();
  const [emp, stu] = await Promise.all([
    supabase.from("attendance")
      .select("id, punch_type, punched_at, snapshot_url, employees(employee_code, full_name, department, photo_url)")
      .gte("punched_at", start).lte("punched_at", end).order("punched_at", { ascending: false }),
    supabase.from("student_attendance")
      .select("id, punch_type, punched_at, snapshot_url, students(student_code, full_name, department, photo_url)")
      .gte("punched_at", start).lte("punched_at", end).order("punched_at", { ascending: false }),
  ]);
  if (emp.error) throw new Error(emp.error.message);
  if (stu.error) throw new Error(stu.error.message);

  const rows: AttRow[] = [];
  for (const r of emp.data ?? []) {
    const p = (r as { employees: { employee_code: string; full_name: string; department: string | null; photo_url: string | null } | null }).employees;
    rows.push({ id: r.id, kind: "Staff", punch_type: r.punch_type as "in" | "out", punched_at: r.punched_at, snapshot_url: r.snapshot_url,
      code: p?.employee_code ?? "", name: p?.full_name ?? "—", department: p?.department ?? null, photo_url: p?.photo_url ?? null });
  }
  for (const r of stu.data ?? []) {
    const p = (r as { students: { student_code: string; full_name: string; department: string | null; photo_url: string | null } | null }).students;
    rows.push({ id: r.id, kind: "Student", punch_type: r.punch_type as "in" | "out", punched_at: r.punched_at, snapshot_url: r.snapshot_url,
      code: p?.student_code ?? "", name: p?.full_name ?? "—", department: p?.department ?? null, photo_url: p?.photo_url ?? null });
  }
  return rows.sort((a, b) => b.punched_at.localeCompare(a.punched_at));
}

export default function AttendanceList() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchRows(from, to)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not load records"); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("attendance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "student_attendance" }, () => load())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  function exportExcel() {
    if (rows.length === 0) return toast.error("No data to export");
    const data = rows.map(r => ({
      "Type": r.kind,
      "Code": r.code,
      "Name": r.name,
      "Department": r.department ?? "",
      "Punch": r.punch_type === "in" ? "IN" : "OUT",
      "Date": new Date(r.punched_at).toLocaleDateString(),
      "Time": new Date(r.punched_at).toLocaleTimeString(),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance_${from}_to_${to}.xlsx`);
    toast.success("Excel downloaded");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={load} disabled={loading} className="sm:mt-5"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={exportExcel} className="sm:mt-5"><FileSpreadsheet className="mr-2 h-4 w-4" />Export Excel</Button>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Radio className={`h-3.5 w-3.5 ${live ? "text-emerald-500" : ""}`} />
        {live ? "Live — new punches appear instantly" : "Connecting to live updates…"}
      </p>

      <div className="space-y-2">
        {rows.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No attendance records in this range.</CardContent></Card>
        )}
        {rows.map(r => (
          <Card key={`${r.kind}-${r.id}`}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                {r.photo_url ? <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{r.code}</span> · {r.kind}{r.department ? ` · ${r.department}` : ""}
                </p>
              </div>
              {r.snapshot_url && <img src={r.snapshot_url} alt="Punch snapshot" className="h-10 w-10 shrink-0 rounded object-cover" />}
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${r.punch_type === "in" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                {r.punch_type === "in" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold uppercase">{r.punch_type}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.punched_at).toLocaleTimeString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
